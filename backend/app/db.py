from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings

_settings = get_settings()

engine = create_async_engine(_settings.database_url, pool_size=10, max_overflow=10, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


def worker_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Celery runs each task in a fresh event loop -> pooled connections can't be reused."""
    eng = create_async_engine(_settings.database_url, poolclass=NullPool)
    return async_sessionmaker(eng, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


SEARCH_TRIGGER_SQL = [
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE EXTENSION IF NOT EXISTS vector",
    """
    CREATE OR REPLACE FUNCTION vacancies_search_update() RETURNS trigger AS $$
    BEGIN
      NEW.search :=
        setweight(to_tsvector('russian', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('simple', array_to_string(coalesce(NEW.tags, '{}'), ' ')), 'B') ||
        setweight(to_tsvector('russian', coalesce(NEW.description_text, '')), 'C');
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
    """,
    "DROP TRIGGER IF EXISTS trg_vacancies_search ON vacancies",
    """
    CREATE TRIGGER trg_vacancies_search BEFORE INSERT OR UPDATE OF title, description_text, tags
    ON vacancies FOR EACH ROW EXECUTE FUNCTION vacancies_search_update();
    """,
]


async def ping_db() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
