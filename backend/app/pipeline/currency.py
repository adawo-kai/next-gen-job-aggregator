"""Currency rates from the Central Bank of Russia, cached in Redis + persisted in Postgres."""

from __future__ import annotations

import json

import httpx
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CurrencyRate
from app.observability import log

CBR_URL = "https://www.cbr-xml-daily.ru/daily_json.js"
CACHE_KEY = "fx:rates"
FALLBACK = {"RUB": 1.0, "USD": 92.0, "EUR": 99.0, "KZT": 0.18, "BYN": 28.0, "UZS": 0.0072, "GBP": 116.0, "AMD": 0.24, "GEL": 34.0}
SUPPORTED = ["RUB", "USD", "EUR", "KZT"]


async def refresh_rates(session: AsyncSession, redis: Redis | None) -> dict[str, float]:
    rates = dict(FALLBACK)
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            data = (await c.get(CBR_URL)).json()
        for code, v in data["Valute"].items():
            rates[code] = v["Value"] / v["Nominal"]
    except Exception as e:  # network down -> keep last known
        log.warning("fx_refresh_failed", error=str(e))
        return await get_rates(session, redis)
    for code, rub in rates.items():
        stmt = insert(CurrencyRate).values(code=code, rub=rub)
        await session.execute(stmt.on_conflict_do_update(index_elements=["code"], set_={"rub": rub}))
    await session.commit()
    if redis is not None:
        await redis.set(CACHE_KEY, json.dumps(rates), ex=6 * 3600)
    log.info("fx_refreshed", usd=round(rates["USD"], 2), eur=round(rates["EUR"], 2))
    return rates


async def get_rates(session: AsyncSession, redis: Redis | None) -> dict[str, float]:
    if redis is not None:
        try:
            cached = await redis.get(CACHE_KEY)
            if cached:
                return json.loads(cached)
        except Exception:
            pass
    rows = (await session.execute(select(CurrencyRate))).scalars().all()
    rates = {r.code: r.rub for r in rows} or dict(FALLBACK)
    rates.setdefault("RUB", 1.0)
    if redis is not None and rows:
        try:
            await redis.set(CACHE_KEY, json.dumps(rates), ex=3600)
        except Exception:
            pass
    return rates


def to_rub(amount: int | None, currency: str | None, rates: dict[str, float]) -> int | None:
    if amount is None:
        return None
    return int(round(amount * rates.get((currency or "RUB").upper(), 1.0)))


def from_rub(amount: int | None, currency: str, rates: dict[str, float]) -> int | None:
    if amount is None:
        return None
    return int(round(amount / rates.get(currency.upper(), 1.0)))
