"""One-shot init container: schema, extensions, FTS trigger, FX rates, demo seed + first pipeline pass.

Idempotent — safe to run on every `docker compose up`.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import func, select, text

from app.config import get_settings
from app.db import SEARCH_TRIGGER_SQL, engine, worker_sessionmaker
from app.models import Base, Vacancy
from app.observability import log, setup_logging


async def main() -> None:
    setup_logging("bootstrap")
    s = get_settings()
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        for stmt in SEARCH_TRIGGER_SQL:
            await conn.execute(text(stmt))
    log.info("schema_ready")

    from redis.asyncio import Redis

    from app.pipeline.currency import refresh_rates

    Session = worker_sessionmaker()
    async with Session() as session:
        await refresh_rates(session, Redis.from_url(s.redis_url, decode_responses=True))
        count = await session.scalar(select(func.count()).select_from(Vacancy))

    if count == 0 and "demo" in s.enabled_sources:
        from app.worker import _collect, _pipeline

        log.info("seeding_demo")
        await _collect("demo", 10_000)
        await _pipeline()

    # kick off live collection immediately instead of waiting for the first beat tick
    from app.worker import celery

    for src in s.enabled_sources:
        if src != "demo":
            celery.send_task("jobs.collect", args=[src], queue=f"collect.{src}")
    log.info("bootstrap_done")


if __name__ == "__main__":
    asyncio.run(main())
