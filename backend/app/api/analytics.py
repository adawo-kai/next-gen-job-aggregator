from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_redis
from app.models import CollectorRun, User, Vacancy, VacancySource
from app.pipeline.currency import get_rates
from app.pipeline.market import percentile
from app.pipeline.match import compute
from app.pipeline.normalize import GRADES
from app.security import current_user
from app.serializers import profile_view, vacancy_view

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _mid(f, t):
    if f is None and t is None:
        return None
    return int(((f or t) + (t or f)) / 2)


@router.get("/market")
async def market(tag: str | None = None, grade: str | None = None, session: AsyncSession = Depends(get_session)):
    redis = get_redis()
    key = f"analytics:market:{tag}:{grade}"
    try:
        if hit := await redis.get(key):
            return json.loads(hit)
    except Exception:
        pass
    q = select(Vacancy.tags, Vacancy.grade, Vacancy.salary_rub_from, Vacancy.salary_rub_to, Vacancy.salary_estimated,
               Vacancy.work_format, Vacancy.published_at)
    conds = []
    if tag:
        conds.append(Vacancy.tags.contains([tag]))
    if grade:
        conds.append(Vacancy.grade == grade)
    q = q.where(*conds)
    ids = select(Vacancy.id).where(*conds)
    rows = (await session.execute(q)).all()

    skill_cnt: Counter[str] = Counter()
    skill_sal: dict[str, list[int]] = defaultdict(list)
    grade_sal: dict[str, list[int]] = defaultdict(list)
    fmt: Counter[str] = Counter()
    trend: Counter[str] = Counter()
    since = datetime.now(UTC) - timedelta(days=30)
    for tags, g, f, t, est, wf, pub in rows:
        m = None if est else _mid(f, t)
        for s in (tags or [])[:10]:
            skill_cnt[s] += 1
            if m:
                skill_sal[s].append(m)
        if g and m:
            grade_sal[g].append(m)
        fmt[wf or "unknown"] += 1
        if pub and pub >= since:
            trend[pub.date().isoformat()] += 1

    since24 = datetime.now(UTC) - timedelta(hours=24)
    by_src = (await session.execute(select(VacancySource.source, func.count(func.distinct(VacancySource.vacancy_id))).group_by(VacancySource.source))).all()
    errs = dict((await session.execute(select(CollectorRun.source, func.count()).where(CollectorRun.status == "error", CollectorRun.started_at >= since24).group_by(CollectorRun.source))).all())
    # every total respects the same filters, so KPI tiles always describe the selected slice
    total_links = await session.scalar(select(func.count()).where(VacancySource.vacancy_id.in_(ids)))
    companies = await session.scalar(
        select(func.count(func.distinct(Vacancy.company_id))).where(*conds, Vacancy.company_id.is_not(None)))
    ghosts = await session.scalar(select(func.count()).where(*conds, Vacancy.is_ghost.is_(True)))
    out = {
        "totals": {
            "vacancies": len(rows),
            "companies": companies or 0,
            "sources": len(by_src),
            "merged_duplicates": max((total_links or 0) - len(rows), 0),
            "ghosts": ghosts or 0,
        },
        "top_skills": [
            {"skill": s, "count": c, "median_salary_rub": int(statistics.median(skill_sal[s])) if skill_sal[s] else None}
            for s, c in skill_cnt.most_common(20)
        ],
        "salary_by_grade": [
            {"grade": g, "p25": percentile(grade_sal[g], .25), "p50": percentile(grade_sal[g], .5),
             "p75": percentile(grade_sal[g], .75), "count": len(grade_sal[g])}
            for g in GRADES if grade_sal.get(g)
        ],
        "by_source": [{"source": s, "count": c, "errors_24h": errs.get(s, 0)} for s, c in by_src],
        "by_format": [{"format": k, "count": v} for k, v in fmt.most_common()],
        "trend": [{"date": d, "count": trend[d]} for d in sorted(trend)],
    }
    try:
        await redis.set(key, json.dumps(out), ex=120)
    except Exception:
        pass
    return out


@router.get("/skill-gap", summary="Which skill to learn next to unlock the most vacancies")
async def skill_gap(threshold: int = 70, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    rates = await get_rates(session, get_redis())
    pv = profile_view(user, rates)
    vacs = (await session.execute(select(Vacancy).where(Vacancy.is_ghost.is_(False)).order_by(Vacancy.published_at.desc()).limit(1500))).scalars().all()
    views = [vacancy_view(v) for v in vacs]
    base = sum(1 for vv in views if compute(pv, vv).score >= threshold)
    # candidates: most frequent missing must-have skills among "almost matching" vacancies
    near: Counter[str] = Counter()
    for vv in views:
        r = compute(pv, vv)
        if threshold - 35 <= r.score < threshold:
            near.update(r.missing_must[:3])
    suggestions = []
    for skill, _ in near.most_common(8):
        pv2 = profile_view(user, rates)
        pv2.skills = [*pv.skills, skill]
        hits = [v for v, vv in zip(vacs, views) if compute(pv2, vv).score >= threshold]
        unlocks = len(hits) - base
        sal = [_mid(v.salary_rub_from, v.salary_rub_to) for v in hits if v.salary_rub_from and not v.salary_estimated]
        if unlocks > 0:
            suggestions.append({"skill": skill, "unlocks": unlocks, "median_salary_rub": int(statistics.median(sal)) if sal else None})
    suggestions.sort(key=lambda x: -x["unlocks"])
    return {"current_matches": base, "threshold": threshold, "suggestions": suggestions[:6]}
