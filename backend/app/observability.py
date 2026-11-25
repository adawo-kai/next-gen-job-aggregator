"""Structured JSON logging + Prometheus metrics shared by API, workers and bot."""

from __future__ import annotations

import logging
import sys

import structlog
from prometheus_client import Counter, Gauge, Histogram

from app.config import get_settings


def setup_logging(service: str) -> None:
    level = getattr(logging, get_settings().log_level.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(ensure_ascii=False),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    structlog.contextvars.bind_contextvars(service=service)


log = structlog.get_logger()

VACANCIES_COLLECTED = Counter(
    "jobs_vacancies_collected_total", "Raw vacancies fetched", ["source"]
)
VACANCIES_NEW = Counter("jobs_vacancies_new_total", "New canonical vacancies", ["source"])
VACANCIES_MERGED = Counter(
    "jobs_vacancies_merged_total", "Raw vacancies merged into existing cluster", ["source"]
)
COLLECT_ERRORS = Counter("jobs_collect_errors_total", "Collector failures", ["source"])
COLLECT_DURATION = Histogram("jobs_collect_duration_seconds", "Collector run time", ["source"])
LLM_CALLS = Counter("jobs_llm_calls_total", "LLM enrichment calls", ["method", "status"])
LLM_COST = Counter("jobs_llm_cost_usd_total", "LLM spend in USD")
NOTIFICATIONS = Counter("jobs_notifications_sent_total", "Telegram notifications", ["kind"])
HTTP_REQUESTS = Histogram(
    "jobs_http_request_duration_seconds", "API latency", ["method", "route", "status"]
)
VACANCIES_TOTAL = Gauge("jobs_vacancies_total", "Canonical vacancies in DB")
