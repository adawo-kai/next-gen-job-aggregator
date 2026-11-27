"""One-shot init container: schema, extensions, FTS trigger, FX rates, demo seed + first pipeline pass.

Idempotent — safe to run on every `docker compose up`.
"""

from __future__ import annotations

import asyncio

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, inspect, select

from app.config import get_settings
from app.db import worker_sessionmaker
from app.models import Vacancy
from app.observability import log, setup_logging

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def migrate() -> None:
    """alembic upgrade head; a DB created before migrations existed is stamped instead of re-created."""
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(ALEMBIC_INI.parent / "migrations"))
    eng = create_engine(get_settings().sync_database_url)
    tables = set(inspect(eng).get_table_names())
    eng.dispose()
    if "vacancies" in tables and "alembic_version" not in tables:
        command.stamp(cfg, "0001")
        log.info("schema_stamped_legacy")
    command.upgrade(cfg, "head")


async def main() -> None:
    setup_logging("bootstrap")
    s = get_settings()
    await asyncio.to_thread(migrate)
    log.info("schema_ready")

    from redis.asyncio import Redis

    from app.pipeline.currency import refresh_rates

    Session = worker_sessionmaker()
    async with Session() as session:
        await refresh_rates(session, Redis.from_url(s.redis_url, decode_responses=True))
        count = await session.scalar(select(func.count()).select_from(Vacancy))

    # the generated dataset (fake companies) is for local dev/CI only — never in production
    if count == 0 and "demo" in s.enabled_sources and s.env != "prod":
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
