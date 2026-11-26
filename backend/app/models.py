from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def now_col(**kw):
    return mapped_column(DateTime(timezone=True), server_default=func.now(), **kw)


# ---------------------------------------------------------------- collection
class CollectorRun(Base):
    __tablename__ = "collector_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    started_at: Mapped[datetime] = now_col()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="running")  # ok|error|skipped
    fetched: Mapped[int] = mapped_column(Integer, default=0)
    new: Mapped[int] = mapped_column(Integer, default=0)
    merged: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)


class RawVacancy(Base):
    __tablename__ = "raw_vacancies"
    __table_args__ = (UniqueConstraint("source", "external_id"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source: Mapped[str] = mapped_column(String(32))
    external_id: Mapped[str] = mapped_column(String(128))
    url: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = now_col()
    vacancy_id: Mapped[int | None] = mapped_column(ForeignKey("vacancies.id", ondelete="SET NULL"), index=True)


# ---------------------------------------------------------------- domain
class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    norm_name: Mapped[str] = mapped_column(String(255), unique=True)
    logo_url: Mapped[str | None] = mapped_column(Text)
    trust_score: Mapped[int] = mapped_column(Integer, default=80)


class Vacancy(Base):
    """Canonical (deduplicated) vacancy. One row per real-world opening."""

    __tablename__ = "vacancies"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    norm_title: Mapped[str] = mapped_column(Text)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), index=True)
    description_html: Mapped[str] = mapped_column(Text, default="")
    description_text: Mapped[str] = mapped_column(Text, default="")

    salary_from: Mapped[int | None] = mapped_column(Integer)
    salary_to: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str | None] = mapped_column(String(8))
    salary_gross: Mapped[bool | None] = mapped_column(Boolean)
    salary_rub_from: Mapped[int | None] = mapped_column(Integer, index=True)
    salary_rub_to: Mapped[int | None] = mapped_column(Integer)
    salary_estimated: Mapped[bool] = mapped_column(Boolean, default=False)

    grade: Mapped[str | None] = mapped_column(String(16), index=True)
    work_format: Mapped[str | None] = mapped_column(String(16), index=True)
    city: Mapped[str | None] = mapped_column(String(128), index=True)
    country: Mapped[str | None] = mapped_column(String(64))
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    must_have: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    nice_to_have: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    sources: Mapped[list[str]] = mapped_column(ARRAY(String(32)), default=list)

    summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    red_flags: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    water_score: Mapped[int] = mapped_column(Integer, default=0)
    enrichment: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    enriched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    is_ghost: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    ghost_reason: Mapped[str | None] = mapped_column(Text)
    repost_count: Mapped[int] = mapped_column(Integer, default=0)

    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    first_seen_at: Mapped[datetime] = now_col()
    last_seen_at: Mapped[datetime] = now_col()
    search: Mapped[Any] = mapped_column(TSVECTOR)

    company: Mapped[Company | None] = relationship(lazy="joined")
    links: Mapped[list[VacancySource]] = relationship(
        back_populates="vacancy", lazy="selectin", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_vacancies_search", "search", postgresql_using="gin"),
        Index("ix_vacancies_tags", "tags", postgresql_using="gin"),
        Index(
            "ix_vacancies_norm_title_trgm",
            "norm_title",
            postgresql_using="gin",
            postgresql_ops={"norm_title": "gin_trgm_ops"},
        ),
    )


class VacancySource(Base):
    """All platform links of a canonical vacancy + why they were merged."""

    __tablename__ = "vacancy_sources"
    __table_args__ = (UniqueConstraint("source", "external_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    vacancy_id: Mapped[int] = mapped_column(ForeignKey("vacancies.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(32))
    external_id: Mapped[str] = mapped_column(String(128))
    url: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    merge_reason: Mapped[str] = mapped_column(Text, default="origin")
    merge_score: Mapped[float] = mapped_column(Float, default=1.0)
    vacancy: Mapped[Vacancy] = relationship(back_populates="links")


class RepostEvent(Base):
    """Every sighting of a fingerprint — the input of the ghost-vacancy detector."""

    __tablename__ = "repost_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    company_id: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(32))
    external_id: Mapped[str] = mapped_column(String(128))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_repost_src_ext"),)


class CurrencyRate(Base):
    __tablename__ = "currency_rates"
    code: Mapped[str] = mapped_column(String(8), primary_key=True)
    rub: Mapped[float] = mapped_column(Float)  # 1 unit = X RUB
    updated_at: Mapped[datetime] = now_col(onupdate=func.now())


class LLMUsage(Base):
    __tablename__ = "llm_usage"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = now_col()
    model: Mapped[str] = mapped_column(String(64))
    input_tokens: Mapped[int] = mapped_column(Integer)
    output_tokens: Mapped[int] = mapped_column(Integer)
    cost_usd: Mapped[float] = mapped_column(Float)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    result: Mapped[dict[str, Any]] = mapped_column(JSONB)


# ---------------------------------------------------------------- users
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    tg_link_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    tg_link_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    display_name: Mapped[str | None] = mapped_column(String(128))
    telegram_username: Mapped[str | None] = mapped_column(String(64))
    photo_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now_col()

    desired_salary: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="RUB")
    grade: Mapped[str | None] = mapped_column(String(16))
    work_formats: Mapped[list[str]] = mapped_column(ARRAY(String(16)), default=list)
    skills: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    stop_words: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    city: Mapped[str | None] = mapped_column(String(128))
    hidden_vacancies: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True)
    family: Mapped[str] = mapped_column(String(64), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class TrackerItem(Base):
    __tablename__ = "tracker_items"
    __table_args__ = (UniqueConstraint("user_id", "vacancy_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    vacancy_id: Mapped[int] = mapped_column(ForeignKey("vacancies.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default="saved")
    note: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = now_col(onupdate=func.now())
    vacancy: Mapped[Vacancy] = relationship(lazy="joined")
    reminders: Mapped[list[Reminder]] = relationship(lazy="selectin", cascade="all, delete-orphan")


class TrackerEvent(Base):
    __tablename__ = "tracker_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("tracker_items.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = now_col()


class Reminder(Base):
    __tablename__ = "reminders"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("tracker_items.id", ondelete="CASCADE"), index=True)
    remind_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    text: Mapped[str] = mapped_column(Text)
    sent: Mapped[bool] = mapped_column(Boolean, default=False)


class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    filters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    mode: Mapped[str] = mapped_column(String(16), default="instant")
    min_match: Mapped[int | None] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = now_col()
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NotificationSent(Base):
    __tablename__ = "notifications_sent"
    __table_args__ = (UniqueConstraint("user_id", "vacancy_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    vacancy_id: Mapped[int] = mapped_column(Integer)
    subscription_id: Mapped[int | None] = mapped_column(Integer)
    sent_at: Mapped[datetime] = now_col()
