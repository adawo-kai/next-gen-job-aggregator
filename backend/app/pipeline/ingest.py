"""Ingest: raw -> normalise -> dedup -> canonical vacancy + repost history + ghost flag."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.collectors.base import RawVacancy as RawDTO
from app.config import get_settings
from app.models import Company, RawVacancy, RepostEvent, Vacancy, VacancySource
from app.observability import VACANCIES_MERGED, VACANCIES_NEW, log
from app.pipeline.currency import get_rates, to_rub
from app.pipeline.dedup import find_duplicate
from app.pipeline.normalize import normalize, repost_key
from app.pipeline.quality import is_it


@dataclass
class IngestStats:
    fetched: int = 0
    new: int = 0
    merged: int = 0
    seen: int = 0
    skipped_non_it: int = 0
    new_ids: list[int] | None = None


async def upsert_company(session: AsyncSession, name: str | None, norm: str | None, logo: str | None) -> int | None:
    if not norm:
        return None
    stmt = insert(Company).values(name=name, norm_name=norm, logo_url=logo)
    stmt = stmt.on_conflict_do_update(
        index_elements=["norm_name"], set_={"logo_url": func.coalesce(Company.logo_url, stmt.excluded.logo_url)}
    ).returning(Company.id)
    return (await session.execute(stmt)).scalar_one()


def _json_safe(raw: RawDTO) -> dict:
    d = asdict(raw)
    if d.get("published_at"):
        d["published_at"] = d["published_at"].isoformat()
    return d


async def ingest(session: AsyncSession, raws: list[RawDTO], redis=None) -> IngestStats:
    stats = IngestStats(fetched=len(raws), new_ids=[])
    rates = await get_rates(session, redis)
    for raw in raws:
        try:
            async with session.begin_nested():  # savepoint: one bad item never kills the batch
                await _ingest_one(session, raw, rates, stats)
        except Exception as e:
            log.warning("ingest_item_failed", source=raw.source, external_id=raw.external_id, error=str(e)[:300])
    await session.commit()
    log.info("ingest_done", **{k: v for k, v in asdict(stats).items() if k != "new_ids"})
    return stats


async def _ingest_one(session: AsyncSession, raw: RawDTO, rates: dict, stats: IngestStats) -> None:
    """Process one raw posting; caller wraps it in a savepoint."""
    existing = await session.scalar(
        select(VacancySource).where(VacancySource.source == raw.source, VacancySource.external_id == raw.external_id)
    )
    if existing is not None:
        await session.execute(
            Vacancy.__table__.update().where(Vacancy.id == existing.vacancy_id).values(last_seen_at=func.now())
        )
        stats.seen += 1
        return

    n = normalize(raw)
    if not is_it(n):
        stats.skipped_non_it += 1
        return
    company_id = await upsert_company(session, n.company, n.norm_company, raw.company_logo)
    decision = await find_duplicate(session, n, company_id)

    if decision.vacancy is None:
        v = Vacancy(
            title=n.title,
            norm_title=n.norm_title,
            fingerprint=n.fingerprint,
            company_id=company_id,
            description_html=n.description_html,
            description_text=n.description_text,
            salary_from=n.salary_from,
            salary_to=n.salary_to,
            currency=n.currency,
            salary_gross=n.salary_gross,
            salary_rub_from=to_rub(n.salary_from or n.salary_to, n.currency, rates),
            salary_rub_to=to_rub(n.salary_to or n.salary_from, n.currency, rates),
            grade=n.grade,
            work_format=n.work_format,
            city=n.city,
            country=n.country,
            tags=n.skills,
            must_have=[],
            nice_to_have=[],
            sources=[raw.source],
            red_flags=[],
            published_at=n.published_at,
        )
        session.add(v)
        await session.flush()
        stats.new += 1
        stats.new_ids.append(v.id)
        VACANCIES_NEW.labels(raw.source).inc()
        reason, score = "origin", 1.0
    else:
        v = decision.vacancy
        reason, score = decision.reason, decision.score
        if raw.source not in (v.sources or []):
            v.sources = [*(v.sources or []), raw.source]
        # enrich canonical record with better data from the new copy
        if not v.salary_from and not v.salary_to and (n.salary_from or n.salary_to):
            v.salary_from, v.salary_to, v.currency = n.salary_from, n.salary_to, n.currency
            v.salary_rub_from = to_rub(n.salary_from or n.salary_to, n.currency, rates)
            v.salary_rub_to = to_rub(n.salary_to or n.salary_from, n.currency, rates)
            v.salary_estimated = False
        if len(n.description_text) > len(v.description_text or ""):
            v.description_text, v.description_html = n.description_text, n.description_html
        v.grade = v.grade or n.grade
        v.work_format = v.work_format or n.work_format
        v.city = v.city or n.city
        v.company_id = v.company_id or company_id
        v.tags = list(dict.fromkeys([*(v.tags or []), *n.skills]))[:25]
        v.last_seen_at = datetime.now(UTC)
        if n.published_at > v.published_at:
            v.published_at = n.published_at
        stats.merged += 1
        VACANCIES_MERGED.labels(raw.source).inc()

    session.add(
        VacancySource(
            vacancy_id=v.id, source=raw.source, external_id=raw.external_id, url=raw.url,
            published_at=n.published_at, merge_reason=reason, merge_score=score,
        )
    )
    await session.execute(
        insert(RawVacancy)
        .values(
            source=raw.source, external_id=raw.external_id, url=raw.url, content_hash=n.content_hash,
            payload={"raw": _json_safe(raw), "source_payload": raw.payload}, vacancy_id=v.id,
        )
        .on_conflict_do_nothing()
    )
    rkey = repost_key(n.norm_company, n.norm_title)
    await session.execute(
        insert(RepostEvent)
        .values(fingerprint=rkey, company_id=company_id, source=raw.source, external_id=raw.external_id, published_at=n.published_at)
        .on_conflict_do_nothing()
    )
    await update_ghost(session, v, rkey)


async def update_ghost(session: AsyncSession, v: Vacancy, rkey: str) -> None:
    """Ghost ('eternal search') detector: same company+title republished many times over a long period."""
    s = get_settings()
    row = (
        await session.execute(
            select(
                func.count(func.distinct(RepostEvent.external_id)),
                func.min(RepostEvent.published_at),
                func.max(RepostEvent.published_at),
            ).where(RepostEvent.fingerprint == rkey)
        )
    ).one()
    count, first, last = row
    v.repost_count = max(int(count or 1) - 1, 0)
    if count and first and last:
        days = (last - first).days
        if count >= s.ghost_min_reposts and days >= s.ghost_min_days:
            v.is_ghost = True
            weeks = max(days // 7, 1)
            v.ghost_reason = (
                f"Опубликована {count} раз за {days} дн. (≈ раз в {max(weeks * 7 // count, 1)} дн.) "
                "без признаков закрытия — подозрение на вечный поиск"
            )
