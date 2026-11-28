"""Vacancy search: full-text (ru+en, weighted) + trigram fallback, filters, sort, cursor pagination.

Shared by the REST API and by the subscription notifier, so a subscription is literally a saved search.
"""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import Select, and_, case, func, literal, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Vacancy
from app.pipeline.currency import to_rub
from app.pipeline.textmatch import lookalike_variants, search_tokens, stop_word_terms, token_canonical


@dataclass
class SearchParams:
    q: str | None = None
    salary_min: int | None = None
    currency: str = "RUB"
    grade: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    format: list[str] = field(default_factory=list)
    city: str | None = None
    country: str | None = None
    source: list[str] = field(default_factory=list)
    hide_ghost: bool = False
    only_with_salary: bool = False
    sort: str = "date"
    cursor: str | None = None
    limit: int = 20
    created_after: datetime | None = None

    @classmethod
    def from_filters(cls, d: dict) -> SearchParams:
        known = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        for k in ("grade", "tags", "format", "source"):
            if isinstance(known.get(k), str):
                known[k] = [known[k]]
        return cls(**known)


def encode_cursor(d: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(d, default=str).encode()).decode()


def decode_cursor(c: str | None) -> dict:
    if not c:
        return {}
    try:
        return json.loads(base64.urlsafe_b64decode(c.encode()))
    except Exception:
        return {}


def build_query(p: SearchParams, rates: dict[str, float], user: User | None) -> tuple[Select, object | None]:
    q = select(Vacancy)
    rank = None
    if p.q and p.q.strip():
        text = p.q.strip()
        tsq_ru = func.websearch_to_tsquery("russian", text)
        tsq_en = func.websearch_to_tsquery("english", text)
        tsq_simple = func.websearch_to_tsquery("simple", text)
        # every word must match somewhere; a word may match by text, by title, or as a known skill
        # ("пайтон" -> Python, "c++" / "c#" stay distinct instead of collapsing to "c")
        title_boost = literal(0.0)
        for tok in search_tokens(text)[:8]:
            canon = token_canonical(tok)
            alts = {v for v in lookalike_variants(tok)} | ({canon.lower()} if canon else set())
            conds = [Vacancy.title.ilike(f"%{_like(a)}%") for a in alts]
            if canon:
                conds.append(Vacancy.tags.contains([canon]))
            if re.fullmatch(r"[\w]+", tok):  # plain words also via full-text (morphology)
                for cfg in ("russian", "english", "simple"):
                    conds.append(Vacancy.search.op("@@")(func.plainto_tsquery(cfg, tok)))
            q = q.where(or_(*conds))
            title_boost = title_boost + case((or_(*[Vacancy.title.ilike(f"%{_like(a)}%") for a in alts]), 1.0), else_=0.0)
        rank = (
            func.ts_rank_cd(Vacancy.search, tsq_ru)
            + func.ts_rank_cd(Vacancy.search, tsq_en)
            + func.ts_rank_cd(Vacancy.search, tsq_simple)
            + func.word_similarity(func.lower(literal(text)), func.lower(Vacancy.title))
            + title_boost  # a hit in the title beats a hit in the tags/description
        )
    if p.salary_min:
        # only real salaries count: a market estimate must never satisfy "от N"
        rub = to_rub(p.salary_min, p.currency, rates)
        q = q.where(func.coalesce(Vacancy.salary_rub_to, Vacancy.salary_rub_from) >= rub,
                    Vacancy.salary_estimated.is_(False))
    if p.only_with_salary:
        q = q.where(Vacancy.salary_rub_from.is_not(None), Vacancy.salary_estimated.is_(False))
    if p.grade:
        q = q.where(Vacancy.grade.in_(p.grade))
    if p.tags:
        q = q.where(Vacancy.tags.contains(p.tags))
    if p.format:
        q = q.where(Vacancy.work_format.in_(p.format))
    if p.city:
        q = q.where(Vacancy.city.ilike(f"%{p.city}%"))
    if p.country:
        q = q.where(Vacancy.country.ilike(f"%{p.country}%"))
    if p.source:
        q = q.where(Vacancy.sources.overlap(p.source))
    if p.hide_ghost:
        q = q.where(Vacancy.is_ghost.is_(False))
    if p.created_after:
        q = q.where(Vacancy.first_seen_at > p.created_after)
    if user is not None:
        if user.hidden_vacancies:
            q = q.where(Vacancy.id.not_in(user.hidden_vacancies))
        for w in user.stop_words or []:
            terms = stop_word_terms(w)
            if not terms:
                continue
            # hard filter on the title (+ skill tag): look-alike letters, word forms and synonyms included
            hit = or_(*[Vacancy.title.ilike(f"%{_like(t)}%") for t in terms])
            if canon := token_canonical(w):
                hit = or_(hit, Vacancy.tags.contains([canon]))
            q = q.where(not_(hit))
    return q, rank


def _like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def run_search(session: AsyncSession, p: SearchParams, rates: dict[str, float], user: User | None,
                     scorer=None) -> tuple[list[Vacancy], str | None, int, dict[int, int]]:
    q, rank = build_query(p, rates, user)
    total = await session.scalar(select(func.count()).select_from(q.order_by(None).subquery()))
    cur = decode_cursor(p.cursor)
    limit = max(1, min(p.limit, 100))
    scores: dict[int, int] = {}

    if p.sort == "match" and scorer is not None:
        # score a bounded candidate window in Python (explainable scorer), then page through it
        cands = (await session.execute(q.order_by(Vacancy.published_at.desc()).limit(1500))).scalars().all()
        scored = sorted(((scorer(v), v) for v in cands), key=lambda t: (-t[0], -t[1].id))
        off = int(cur.get("o", 0))
        page = scored[off: off + limit]
        scores = {v.id: s for s, v in page}
        nxt = encode_cursor({"o": off + limit}) if off + limit < len(scored) else None
        return [v for _, v in page], nxt, total or 0, scores

    if p.sort == "date" or (p.sort == "relevance" and rank is None):
        if cur.get("d") and cur.get("i"):
            d = datetime.fromisoformat(cur["d"])
            q = q.where(or_(Vacancy.published_at < d, and_(Vacancy.published_at == d, Vacancy.id < cur["i"])))
        rows = (await session.execute(q.order_by(Vacancy.published_at.desc(), Vacancy.id.desc()).limit(limit + 1))).scalars().all()
        nxt = None
        if len(rows) > limit:
            last = rows[limit - 1]
            nxt = encode_cursor({"d": last.published_at.isoformat(), "i": last.id})
        return list(rows[:limit]), nxt, total or 0, scores

    off = int(cur.get("o", 0))
    if p.sort == "salary":
        # middle of the real range; estimates go after every vacancy with a stated salary
        mid = (func.coalesce(Vacancy.salary_rub_from, Vacancy.salary_rub_to)
               + func.coalesce(Vacancy.salary_rub_to, Vacancy.salary_rub_from)) / 2
        real_mid = case((Vacancy.salary_estimated.is_(True), None), else_=mid)
        order = [real_mid.desc().nulls_last(), Vacancy.id.desc()]
    else:
        order = [rank.desc(), Vacancy.published_at.desc()]
    rows = (await session.execute(q.order_by(*order).offset(off).limit(limit + 1))).scalars().all()
    nxt = encode_cursor({"o": off + limit}) if len(rows) > limit else None
    return list(rows[:limit]), nxt, total or 0, scores


