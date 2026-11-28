from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_redis
from app.models import Subscription, User
from app.pipeline.currency import get_rates
from app.search import SearchParams, build_query
from app.security import current_user

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


class SubIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    filters: dict[str, Any] = Field(default_factory=dict)
    mode: str = Field("instant", pattern="^(instant|digest)$")
    min_match: int | None = Field(None, ge=0, le=100)


class SubPatch(BaseModel):
    name: str | None = None
    filters: dict[str, Any] | None = None
    mode: str | None = Field(None, pattern="^(instant|digest)$")
    min_match: int | None = None
    active: bool | None = None


async def _out(session, s: Subscription, user: User, rates) -> dict:
    from sqlalchemy import func

    p = SearchParams.from_filters(s.filters or {})
    p.created_after = datetime.now(UTC) - timedelta(hours=24)
    q, _ = build_query(p, rates, user)
    n = await session.scalar(select(func.count()).select_from(q.subquery()))
    return {"id": s.id, "name": s.name, "filters": s.filters, "mode": s.mode, "min_match": s.min_match,
            "active": s.active, "created_at": s.created_at.isoformat(), "matched_last_24h": n or 0}


async def _own(session, user, sid) -> Subscription:
    s = await session.get(Subscription, sid)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "Подписка не найдена")
    return s


@router.get("")
async def list_subs(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    rates = await get_rates(session, get_redis())
    rows = (await session.execute(select(Subscription).where(Subscription.user_id == user.id).order_by(Subscription.id))).scalars().all()
    return [await _out(session, s, user, rates) for s in rows]


@router.post("", status_code=201)
async def create(body: SubIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    SearchParams.from_filters(body.filters)  # validates keys
    s = Subscription(user_id=user.id, name=body.name, filters=body.filters, mode=body.mode,
                     min_match=body.min_match, last_checked_at=datetime.now(UTC))
    session.add(s)
    await session.commit()
    return await _out(session, s, user, await get_rates(session, get_redis()))


@router.patch("/{sid}")
async def update(sid: int, body: SubPatch, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    s = await _own(session, user, sid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    await session.commit()
    return await _out(session, s, user, await get_rates(session, get_redis()))


@router.delete("/{sid}", status_code=204)
async def delete(sid: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    await session.delete(await _own(session, user, sid))
    await session.commit()
