"""Post-processing over the whole corpus: enrichment application, salary estimate, company trust."""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Company, LLMUsage, Vacancy
from app.observability import log
from app.pipeline.enrich import PROMPT_VERSION, enrich


def percentile(vals: list[int], p: float) -> int:
    if not vals:
        return 0
    vals = sorted(vals)
    k = (len(vals) - 1) * p
    f, c = int(k), min(int(k) + 1, len(vals) - 1)
    return int(vals[f] + (vals[c] - vals[f]) * (k - f))


async def enrich_pending(session: AsyncSession, limit: int = 200) -> int:
    s = get_settings()
    rows = (
        await session.execute(
            select(Vacancy).where(Vacancy.enriched_at.is_(None)).order_by(Vacancy.id).limit(limit)
        )
    ).scalars().all()
    spent_today = await session.scalar(
        select(func.coalesce(func.sum(LLMUsage.cost_usd), 0.0)).where(
            LLMUsage.created_at >= datetime.now(UTC).replace(hour=0, minute=0, second=0)
        )
    )
    llm_left = s.llm_max_per_run if (spent_today or 0) < s.llm_daily_budget_usd else 0
    done = 0
    for v in rows:
        enr, usage = await enrich(
            v.title, v.company.name if v.company else None, v.description_text, v.tags or [],
            bool(v.salary_from or v.salary_to), allow_llm=llm_left > 0,
        )
        if usage is not None:
            llm_left -= 1
            session.add(LLMUsage(model=enr.model, input_tokens=usage.input_tokens, output_tokens=usage.output_tokens,
                                 cost_usd=usage.cost_usd, content_hash=v.fingerprint, result=enr.model_dump()))
        v.tags = list(dict.fromkeys([*enr.stack, *(v.tags or [])]))[:25]
        v.must_have = enr.must_have
        v.nice_to_have = enr.nice_to_have
        v.grade = v.grade or enr.grade
        v.summary = enr.summary.model_dump()
        v.red_flags = [f.model_dump() for f in enr.red_flags]
        v.water_score = enr.water_score
        v.enrichment = {"model": enr.model, "method": enr.method, "prompt_version": PROMPT_VERSION}
        v.enriched_at = datetime.now(UTC)
        done += 1
    await session.commit()
    if done:
        log.info("enriched", count=done)
    return done


async def market_groups(session: AsyncSession) -> dict[tuple[str | None, str | None], list[int]]:
    rows = (
        await session.execute(
            select(Vacancy.grade, Vacancy.tags, Vacancy.salary_rub_from, Vacancy.salary_rub_to).where(
                Vacancy.salary_estimated.is_(False), Vacancy.salary_rub_from.is_not(None)
            )
        )
    ).all()
    groups: dict[tuple[str | None, str | None], list[int]] = defaultdict(list)
    for grade, tags, f, t in rows:
        mid = int(((f or t) + (t or f)) / 2)
        if mid < 15000 or mid > 3_000_000:
            continue
        groups[(grade, None)].append(mid)
        for tag in (tags or [])[:3]:
            groups[(grade, tag)].append(mid)
            groups[(None, tag)].append(mid)
    return groups


def market_for(groups, grade: str | None, tags: list[str]) -> dict | None:
    for key in [*[(grade, t) for t in tags[:3]], (grade, None), *[(None, t) for t in tags[:2]]]:
        vals = groups.get(key)
        if vals and len(vals) >= 5:
            return {"p25": percentile(vals, .25), "p50": percentile(vals, .5), "p75": percentile(vals, .75),
                    "currency": "RUB", "sample": len(vals)}
    return None


async def estimate_salaries(session: AsyncSession) -> int:
    groups = await market_groups(session)
    rows = (
        await session.execute(select(Vacancy).where(Vacancy.salary_from.is_(None), Vacancy.salary_to.is_(None)))
    ).scalars().all()
    n = 0
    for v in rows:
        m = market_for(groups, v.grade, v.tags or [])
        if m:
            v.salary_rub_from, v.salary_rub_to, v.salary_estimated = m["p25"], m["p75"], True
            n += 1
    await session.commit()
    return n


async def update_trust(session: AsyncSession) -> None:
    vac =(await session.execute(select(Vacancy.company_id, Vacancy.is_ghost, Vacancy.red_flags,
                                        Vacancy.salary_estimated, Vacancy.salary_from, Vacancy.water_score)
                                 .where(Vacancy.company_id.is_not(None)))).all()
    agg: dict[int, list] = defaultdict(list)
    for row in vac:
        agg[row[0]].append(row)
    for cid, items in agg.items():
        n = len(items)
        ghost = sum(1 for i in items if i[1]) / n
        flags = statistics.mean(len(i[2] or []) for i in items)
        hidden = sum(1 for i in items if i[4] is None) / n
        water = statistics.mean(i[5] or 0 for i in items)
        score = 100 - 45 * ghost - 9 * flags - 15 * hidden - 0.2 * water
        await session.execute(update(Company).where(Company.id == cid).values(trust_score=int(max(5, min(100, score)))))
    await session.commit()
