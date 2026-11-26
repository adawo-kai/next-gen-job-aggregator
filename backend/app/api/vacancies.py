from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_redis
from app.models import User, Vacancy, VacancySource
from app.pipeline.currency import SUPPORTED, get_rates
from app.pipeline.market import market_for, market_groups
from app.pipeline.match import compute
from app.pipeline.normalize import FORMATS, GRADES
from app.search import SearchParams, run_search
from app.security import current_user, optional_user
from app.serializers import SOURCE_TITLES, card, detail, match_score, profile_view, vacancy_view

router = APIRouter(tags=["vacancies"])
CACHE_TTL = 60


@router.get("/vacancies", summary="Search vacancies (FTS + filters + cursor pagination)")
async def search_vacancies(
    request: Request,
    q: str | None = None,
    salary_min: int | None = Query(None, ge=0),
    currency: str = "RUB",
    grade: list[str] = Query(default=[]),
    tags: list[str] = Query(default=[]),
    format: list[str] = Query(default=[]),
    city: str | None = None,
    country: str | None = None,
    source: list[str] = Query(default=[]),
    hide_ghost: bool = False,
    only_with_salary: bool = False,
    sort: str = Query("date", pattern="^(date|salary|match|relevance)$"),
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    user: User | None = Depends(optional_user),
):
    redis = get_redis()
    # popular anonymous queries are cached in Redis (personalised ones are not)
    cache_key = None
    if user is None:
        cache_key = "search:" + hashlib.md5(str(sorted(request.query_params.multi_items())).encode()).hexdigest()
        try:
            if hit := await redis.get(cache_key):
                return json.loads(hit)
        except Exception:
            pass

    rates = await get_rates(session, redis)
    params = SearchParams(q=q, salary_min=salary_min, currency=currency.upper(), grade=grade, tags=tags,
                          format=format, city=city, country=country, source=source, hide_ghost=hide_ghost,
                          only_with_salary=only_with_salary, sort=sort, cursor=cursor, limit=limit)
    scorer = None
    if user is not None and (user.skills or user.grade):
        pv = profile_view(user, rates)
        scorer = lambda v: compute(pv, vacancy_view(v)).score  # noqa: E731
    elif sort == "match":
        params.sort = "date"
    items, nxt, total, scores = await run_search(session, params, rates, user, scorer)
    out = {
        "items": [card(v, rates, currency, scores.get(v.id) if scores else match_score(user, v, rates)) for v in items],
        "next_cursor": nxt,
        "total": total,
    }
    if cache_key:
        try:
            await redis.set(cache_key, json.dumps(out, default=str), ex=CACHE_TTL)
        except Exception:
            pass
    return out


async def _get(session: AsyncSession, vid: int) -> Vacancy:
    v = await session.get(Vacancy, vid)
    if v is None:
        raise HTTPException(404, "Vacancy not found")
    return v


@router.get("/vacancies/{vid}")
async def get_vacancy(vid: int, currency: str = "RUB", session: AsyncSession = Depends(get_session),
                      user: User | None = Depends(optional_user)):
    v = await _get(session, vid)
    rates = await get_rates(session, get_redis())
    market = market_for(await market_groups(session), v.grade, v.tags or [])
    return detail(v, rates, currency, match_score(user, v, rates), market)


@router.get("/vacancies/{vid}/match")
async def get_match(vid: int, session: AsyncSession = Depends(get_session), user: User = Depends(current_user)):
    v = await _get(session, vid)
    rates = await get_rates(session, get_redis())
    r = compute(profile_view(user, rates), vacancy_view(v))
    return {"score": r.score, "breakdown": r.breakdown, "matched_skills": r.matched_skills,
            "missing_must": r.missing_must, "missing_nice": r.missing_nice}


@router.get("/vacancies/{vid}/similar")
async def similar(vid: int, session: AsyncSession = Depends(get_session), user: User | None = Depends(optional_user)):
    v = await _get(session, vid)
    rates = await get_rates(session, get_redis())
    # candidates: same role words (trigram) OR shared core stack; then rank by role + stack + grade
    sim = func.similarity(Vacancy.norm_title, v.norm_title)
    core = (v.must_have or v.tags or [])[:6]
    cond = sim > 0.3
    if core:
        cond = cond | Vacancy.tags.overlap(core)
    rows = (await session.execute(
        select(Vacancy, sim.label("sim")).where(Vacancy.id != v.id, Vacancy.is_ghost.is_(False), cond)
        .order_by(sim.desc()).limit(300)
    )).all()
    mine = {t.lower() for t in core}

    def score(x: Vacancy, title_sim: float) -> float:
        theirs = {t.lower() for t in (x.tags or [])[:10]}
        stack = len(mine & theirs) / len(mine | theirs) if mine and theirs else 0.0
        grade = 1.0 if v.grade and x.grade == v.grade else 0.0
        return 0.5 * float(title_sim) + 0.4 * stack + 0.1 * grade

    ranked = sorted(rows, key=lambda r: score(r[0], r[1]), reverse=True)
    best = [x for x, s in ranked if score(x, s) >= 0.2][:6]
    return [card(x, rates, "RUB", match_score(user, x, rates)) for x in best]


@router.post("/vacancies/{vid}/hide", status_code=204)
async def hide(vid: int, session: AsyncSession = Depends(get_session), user: User = Depends(current_user)):
    await _get(session, vid)
    if vid not in (user.hidden_vacancies or []):
        user.hidden_vacancies = [*(user.hidden_vacancies or []), vid]
        await session.commit()


@router.get("/meta/filters")
async def meta_filters(session: AsyncSession = Depends(get_session)):
    redis = get_redis()
    try:
        if hit := await redis.get("meta:filters"):
            return json.loads(hit)
    except Exception:
        pass
    src = (await session.execute(select(VacancySource.source, func.count(func.distinct(VacancySource.vacancy_id))).group_by(VacancySource.source))).all()
    tag = func.unnest(Vacancy.tags).label("tag")
    tags_sq = select(tag).subquery()
    top = (await session.execute(select(tags_sq.c.tag, func.count()).group_by(tags_sq.c.tag).order_by(func.count().desc()).limit(40))).all()
    cities = (await session.execute(select(Vacancy.city, func.count()).where(Vacancy.city.is_not(None)).group_by(Vacancy.city).order_by(func.count().desc()).limit(20))).all()
    out = {
        "grades": GRADES, "formats": FORMATS,
        "sources": [{"key": s, "title": SOURCE_TITLES.get(s, s), "count": c} for s, c in src],
        "top_tags": [{"tag": t, "count": c} for t, c in top],
        "cities": [{"city": c, "count": n} for c, n in cities],
        "currencies": SUPPORTED,
    }
    try:
        await redis.set("meta:filters", json.dumps(out), ex=300)
    except Exception:
        pass
    return out
