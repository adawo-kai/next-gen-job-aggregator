from __future__ import annotations

import time

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api import analytics, auth, profile, subscriptions, tracker, vacancies
from app.config import get_settings
from app.db import ping_db
from app.deps import get_redis
from app.observability import HTTP_REQUESTS, log, setup_logging

setup_logging("api")
settings = get_settings()
if settings.env == "prod" and (settings.jwt_secret.startswith(("change-me", "dev-secret")) or len(settings.jwt_secret) < 32):
    raise RuntimeError("Refusing to start in prod with a weak JWT_SECRET (need 32+ random chars)")

app = FastAPI(
    title="Next-Gen Job Aggregator API",
    version="1.0.0",
    description=(
        "Умный агрегатор IT-вакансий: межплощадочная дедупликация, AI-обогащение (стек, грейд, саммари, "
        "red flags, «вода»), объяснимый Match Score, детектор «вечных» вакансий, канбан-трекер откликов, "
        "подписки с уведомлениями в Telegram."
    ),
    openapi_tags=[
        {"name": "vacancies", "description": "Поиск, фильтры, карточки, похожие"},
        {"name": "auth", "description": "JWT access + refresh с ротацией"},
        {"name": "profile", "description": "Профиль кандидата и загрузка резюме"},
        {"name": "tracker", "description": "Канбан-трекер откликов"},
        {"name": "subscriptions", "description": "Подписки на сохранённые поиски"},
        {"name": "analytics", "description": "Аналитика рынка и skill gap"},
        {"name": "service", "description": "Health, readiness, metrics"},
    ],
)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)


@app.middleware("http")
async def access_log(request: Request, call_next):
    t0 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled_error", path=request.url.path)
        response = JSONResponse({"detail": "Internal server error"}, status_code=500)
    dt = time.perf_counter() - t0
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    HTTP_REQUESTS.labels(request.method, path, response.status_code).observe(dt)
    if path not in ("/metrics", "/health"):
        log.info("http", method=request.method, path=path, status=response.status_code, ms=round(dt * 1000, 1))
    return response


api = APIRouter(prefix="/api/v1")
for r in (auth.router, vacancies.router, profile.router, tracker.router, subscriptions.router, analytics.router):
    api.include_router(r)


@api.get("/health", tags=["service"])
async def health_v1():
    return {"status": "ok"}



@app.get("/health", tags=["service"], summary="Liveness")
async def health():
    return {"status": "ok"}


@app.get("/ready", tags=["service"], summary="Readiness: DB + Redis")
async def ready():
    db_ok = await ping_db()
    try:
        redis_ok = bool(await get_redis().ping())
    except Exception:
        redis_ok = False
    ok = db_ok and redis_ok
    return JSONResponse({"status": "ok" if ok else "degraded", "checks": {"db": db_ok, "redis": redis_ok}},
                        status_code=200 if ok else 503)


async def _collector_stats(hours: int = 1) -> list[dict]:
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import case, func, select

    from app.db import SessionLocal
    from app.models import CollectorRun

    since = datetime.now(UTC) - timedelta(hours=hours)
    async with SessionLocal() as s:
        rows = (await s.execute(
            select(CollectorRun.source, func.coalesce(func.sum(CollectorRun.fetched), 0),
                   func.coalesce(func.sum(CollectorRun.new), 0), func.coalesce(func.sum(CollectorRun.merged), 0),
                   func.sum(case((CollectorRun.status == "error", 1), else_=0)), func.count(),
                   func.max(CollectorRun.started_at))
            .where(CollectorRun.started_at >= since).group_by(CollectorRun.source)
        )).all()
    return [{"source": r[0], "fetched": int(r[1]), "new": int(r[2]), "merged": int(r[3]), "errors": int(r[4] or 0),
             "runs": int(r[5]), "last_run": r[6].isoformat() if r[6] else None} for r in rows]


@api.get("/stats/collectors", tags=["service"], summary="Per-source collection stats for the last N hours")
async def collector_stats(hours: int = 1):
    return {"hours": hours, "sources": await _collector_stats(hours)}


app.include_router(api)


@app.get("/metrics", tags=["service"], summary="Prometheus metrics")
async def metrics():
    from prometheus_client import Gauge

    global _G
    try:
        _G
    except NameError:
        _G = (
            Gauge("jobs_collected_last_hour", "Raw vacancies fetched in the last hour", ["source"]),
            Gauge("jobs_new_last_hour", "New canonical vacancies in the last hour", ["source"]),
            Gauge("jobs_collect_errors_last_hour", "Failed collector runs in the last hour", ["source"]),
        )
    try:
        for st in await _collector_stats(1):
            _G[0].labels(st["source"]).set(st["fetched"])
            _G[1].labels(st["source"]).set(st["new"])
            _G[2].labels(st["source"]).set(st["errors"])
    except Exception as e:  # metrics must not fail scraping
        log.warning("metrics_db_failed", error=str(e))
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
