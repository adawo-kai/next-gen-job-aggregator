from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from typing_extensions import Annotated


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Next-Gen Job Aggregator"
    env: str = "dev"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://jobs:jobs@localhost:5432/jobs"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-me-in-prod-please-32-bytes-min"
    access_ttl_seconds: int = 900
    refresh_ttl_days: int = 30

    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    # collectors
    enabled_sources: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["demo", "habr", "telegram", "hh", "devkg", "geekjob"]
    )
    collect_interval_minutes: int = 20
    collect_limit: int = 100
    telegram_channels: Annotated[list[str], NoDecode] = Field(default_factory=list)
    tg_api_id: int | None = None
    tg_api_hash: str | None = None
    hh_access_token: str | None = None
    hh_contact_email: str = "jobagg.dev@gmail.com"
    habr_detail_limit: int = 30
    demo_fixture_path: str = "app/collectors/fixtures/demo_vacancies.json"
    circuit_breaker_threshold: int = 3
    circuit_breaker_cooldown_minutes: int = 30

    # LLM
    anthropic_api_key: str | None = None
    llm_model: str = "claude-haiku-5-5"
    llm_daily_budget_usd: float = 2.0
    llm_max_per_run: int = 50

    # Telegram bot
    telegram_bot_token: str | None = None
    telegram_bot_username: str = "nextgen_jobs_bot"
    # public HTTPS origin of the web app; the Telegram Mini App lives at {webapp_url}/tg
    webapp_url: str | None = None
    tg_init_data_ttl_seconds: int = 86400

    # rate limiting / proxies
    rate_limit_enabled: bool = True
    real_ip_header: str | None = None  # e.g. "cf-connecting-ip" behind a Cloudflare tunnel

    # outgoing mail (password reset). smtp(s)://user:pass@host:port — empty = links are only logged
    smtp_url: str | None = None
    mail_from: str = "JobRadar <noreply@localhost>"
    public_url: str = "http://localhost:3000"  # used in e-mail links

    # error monitoring
    sentry_dsn: str | None = None

    # dedup thresholds
    dedup_title_similarity: float = 0.55
    dedup_text_similarity: float = 0.35

    # ghost detector
    ghost_min_reposts: int = 4
    ghost_min_days: int = 45

    @field_validator("cors_origins", "enabled_sources", "telegram_channels", mode="before")
    @classmethod
    def _split_csv(cls, v):
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @property
    def sync_database_url(self) -> str:
        return self.database_url.replace("+asyncpg", "+psycopg")


@lru_cache
def get_settings() -> Settings:
    return Settings()
