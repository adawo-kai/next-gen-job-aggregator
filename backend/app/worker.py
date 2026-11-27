"""Celery workers + beat schedule.

Queues (worker isolation): one queue per source ``collect.<source>`` + ``pipeline`` + ``notify``.
A blocked/failing source only affects its own queue; a per-source circuit breaker in Redis
pauses it after N consecutive failures.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta

from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_process_init
from kombu import Queue
from redis import Redis as SyncRedis

from app.config import get_settings
from app.observability import COLLECT_DURATION, COLLECT_ERRORS, VACANCIES_COLLECTED, log, setup_logging

settings = get_settings()
SOURCES = ["demo", "habr", "telegram", "hh", "devkg", "geekjob"]

celery = Celery("jobs", broker=settings.redis_url, backend=settings.redis_url)
celery.conf.update(
    task_queues=[Queue(f"collect.{s}") for s in SOURCES] + [Queue("pipeline"), Queue("notify")],
    task_routes={
        "jobs.collect": {"queue": "collect.demo"},  # overridden per call
        "jobs.pipeline": {"queue": "pipeline"},
        "jobs.fx": {"queue": "pipeline"},
        "jobs.notify": {"queue": "notify"},
        "jobs.reminders": {"queue": "notify"},
    },
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=600,
    task_soft_time_limit=540,
    timezone="UTC",
    beat_schedule={
        **{
            f"collect-{s}": {
                "task": "jobs.collect", "args": [s],
                "schedule": timedelta(minutes=settings.collect_interval_minutes),
                "options": {"queue": f"collect.{s}"},
            }
            for s in SOURCES if s != "demo"
        },
        "pipeline": {"task": "jobs.pipeline", "schedule": timedelta(minutes=5)},
        "fx": {"task": "jobs.fx", "schedule": crontab(minute=7, hour="*/6")},
        "notify": {"task": "jobs.notify", "schedule": timedelta(minutes=2)},
        "reminders": {"task": "jobs.reminders", "schedule": timedelta(minutes=1)},
    },
)


@worker_process_init.connect
def _init(**_):
    setup_logging("worker")


def _redis() -> SyncRedis:
    return SyncRedis.from_url(settings.redis_url, decode_responses=True)


# ------------------------------------------------------------------ circuit breaker
class CircuitBreaker:
    def __init__(self, source: str):
        self.r = _redis()
        self.k_fail = f"cb:{source}:fails"
        self.k_open = f"cb:{source}:open_until"

    def is_open(self) -> bool:
        until = self.r.get(self.k_open)
        return bool(until and float(until) > time.time())

    def success(self) -> None:
        self.r.delete(self.k_fail, self.k_open)

    def failure(self) -> int:
        n = self.r.incr(self.k_fail)
        if n >= settings.circuit_breaker_threshold:
            self.r.set(self.k_open, time.time() + settings.circuit_breaker_cooldown_minutes * 60)
        return n


def run(coro):
    return asyncio.run(coro)


# ------------------------------------------------------------------ tasks
async def _collect(source: str, limit: int) -> dict:
    from app.collectors.base import registry
    from app.db import worker_sessionmaker
    from app.models import CollectorRun
    from app.pipeline.ingest import ingest

    Session = worker_sessionmaker()
    cls = registry().get(source)
    async with Session() as session:
        run_row = CollectorRun(source=source, status="running")
        session.add(run_row)
        await session.commit()
        run_id = run_row.id
        if cls is None:
            run_row.status, run_row.error = "skipped", "unknown source"
            await session.commit()
            return {"source": source, "status": "skipped"}
        collector = cls(settings)
        if not collector.enabled():
            run_row.status, run_row.error, run_row.finished_at = "skipped", "disabled (missing credentials)", datetime.now(UTC)
            await session.commit()
            return {"source": source, "status": "skipped"}
        cb = CircuitBreaker(source)
        if cb.is_open():
            run_row.status, run_row.error, run_row.finished_at = "skipped", "circuit breaker open", datetime.now(UTC)
            await session.commit()
            return {"source": source, "status": "circuit_open"}
        t0 = time.perf_counter()
        try:
            raws = await collector.collect(limit=limit)
            VACANCIES_COLLECTED.labels(source).inc(len(raws))
            stats = await ingest(session, raws)
            cb.success()
            run_row.status, run_row.fetched, run_row.new, run_row.merged = "ok", stats.fetched, stats.new, stats.merged
        except Exception as e:
            await session.rollback()
            fails = cb.failure()
            COLLECT_ERRORS.labels(source).inc()
            log.error("collect_failed", source=source, error=str(e)[:500], consecutive_failures=fails)
            run_row = await session.get(CollectorRun, run_id)
            run_row.status, run_row.error = "error", str(e)[:1000]
        finally:
            COLLECT_DURATION.labels(source).observe(time.perf_counter() - t0)
        run_row.finished_at = datetime.now(UTC)
        await session.commit()
        log.info("collect_done", source=source, status=run_row.status, fetched=run_row.fetched, new=run_row.new, merged=run_row.merged)
        return {"source": source, "status": run_row.status, "fetched": run_row.fetched, "new": run_row.new}


@celery.task(name="jobs.collect", bind=True, max_retries=0)
def collect(self, source: str, limit: int | None = None):
    # single-flight per source: overlapping beat ticks / manual kicks never ingest the same source twice at once
    lock = _redis().lock(f"lock:collect:{source}", timeout=600, blocking=False)
    if not lock.acquire(blocking=False):
        log.info("collect_skipped_already_running", source=source)
        return {"source": source, "status": "already_running"}
    try:
        res = run(_collect(source, limit or settings.collect_limit))
    finally:
        try:
            lock.release()
        except Exception:
            pass
    pipeline.apply_async(queue="pipeline")
    return res


async def _pipeline() -> dict:
    from app.db import worker_sessionmaker
    from app.pipeline.market import enrich_pending, estimate_salaries, update_trust

    Session = worker_sessionmaker()
    async with Session() as s:
        total = 0
        while True:
            n = await enrich_pending(s, limit=200)
            total += n
            if n < 200:
                break
        est = await estimate_salaries(s)
        await update_trust(s)
    return {"enriched": total, "salary_estimated": est}


@celery.task(name="jobs.pipeline")
def pipeline():
    return run(_pipeline())


async def _fx():
    from redis.asyncio import Redis

    from app.db import worker_sessionmaker
    from app.pipeline.currency import refresh_rates

    async with worker_sessionmaker()() as s:
        r = Redis.from_url(settings.redis_url, decode_responses=True)
        rates = await refresh_rates(s, r)
        await r.aclose()
        return {k: rates[k] for k in ("USD", "EUR", "KZT") if k in rates}


@celery.task(name="jobs.fx")
def fx():
    return run(_fx())


@celery.task(name="jobs.notify")
def notify():
    from app.notify import send_subscriptions

    return run(send_subscriptions())


@celery.task(name="jobs.reminders")
def reminders():
    from app.notify import send_reminders

    return run(send_reminders())
