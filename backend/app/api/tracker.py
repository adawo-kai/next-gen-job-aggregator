"""Kanban job-application tracker (candidate CRM) with a validated status state machine."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_redis
from app.models import Reminder, TrackerEvent, TrackerItem, User, Vacancy
from app.pipeline.currency import get_rates
from app.security import current_user
from app.serializers import card, match_score

router = APIRouter(prefix="/tracker", tags=["tracker"])

STATUSES = ["saved", "applied", "test_task", "interview", "offer", "rejected"]
TRANSITIONS: dict[str, set[str]] = {
    "saved": {"applied", "rejected"},
    "applied": {"saved", "test_task", "interview", "offer", "rejected"},
    "test_task": {"applied", "interview", "offer", "rejected"},
    "interview": {"test_task", "applied", "offer", "rejected"},
    "offer": {"interview", "rejected"},
    "rejected": {"applied", "test_task", "interview"},
}
FOLLOW_UP_DAYS = 3


def can_move(src: str, dst: str) -> bool:
    return src == dst or dst in TRANSITIONS.get(src, set())


class CreateIn(BaseModel):
    vacancy_id: int
    status: str = "saved"


class PatchIn(BaseModel):
    status: str | None = None
    note: str | None = None
    position: int | None = None


class ReminderIn(BaseModel):
    remind_at: datetime
    text: str


def _rem(r: Reminder) -> dict:
    return {"id": r.id, "remind_at": r.remind_at.isoformat(), "text": r.text, "sent": r.sent}


def _item(i: TrackerItem, rates, user) -> dict:
    return {"id": i.id, "vacancy": card(i.vacancy, rates, "RUB", match_score(user, i.vacancy, rates)),
            "status": i.status, "note": i.note, "position": i.position,
            "reminders": [_rem(r) for r in sorted(i.reminders, key=lambda r: r.remind_at)],
            "updated_at": i.updated_at.isoformat() if i.updated_at else None}


async def _own(session: AsyncSession, user: User, item_id: int) -> TrackerItem:
    i = await session.get(TrackerItem, item_id)
    if i is None or i.user_id != user.id:
        raise HTTPException(404, "Tracker item not found")
    return i


@router.get("")
async def board(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    rates = await get_rates(session, get_redis())
    items = (await session.execute(select(TrackerItem).where(TrackerItem.user_id == user.id)
                                   .order_by(TrackerItem.position, TrackerItem.updated_at.desc()))).scalars().unique().all()
    cols = {s: [] for s in STATUSES}
    for i in items:
        cols.setdefault(i.status, []).append(_item(i, rates, user))
    return {"columns": cols, "transitions": {k: sorted(v) for k, v in TRANSITIONS.items()}}


@router.post("", status_code=201)
async def add(body: CreateIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if body.status not in STATUSES:
        raise HTTPException(422, "Unknown status")
    if await session.get(Vacancy, body.vacancy_id) is None:
        raise HTTPException(404, "Vacancy not found")
    if await session.scalar(select(TrackerItem).where(TrackerItem.user_id == user.id, TrackerItem.vacancy_id == body.vacancy_id)):
        raise HTTPException(409, "Already in tracker")
    pos = await session.scalar(select(func.coalesce(func.max(TrackerItem.position), 0)).where(TrackerItem.user_id == user.id))
    item = TrackerItem(user_id=user.id, vacancy_id=body.vacancy_id, status=body.status, position=(pos or 0) + 1)
    session.add(item)
    await session.flush()
    session.add(TrackerEvent(item_id=item.id, kind="status", payload={"from": None, "to": body.status}))
    await session.commit()
    item = await _own(session, user, item.id)
    await session.refresh(item, ["reminders", "vacancy"])
    return _item(item, await get_rates(session, get_redis()), user)


@router.patch("/{item_id}")
async def patch(item_id: int, body: PatchIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    i = await _own(session, user, item_id)
    if body.status and body.status != i.status:
        if body.status not in STATUSES:
            raise HTTPException(422, "Unknown status")
        if not can_move(i.status, body.status):
            raise HTTPException(422, f"Transition {i.status} → {body.status} is not allowed")
        session.add(TrackerEvent(item_id=i.id, kind="status", payload={"from": i.status, "to": body.status}))
        if body.status == "applied":
            r = Reminder(item_id=i.id, remind_at=datetime.now(UTC) + timedelta(days=FOLLOW_UP_DAYS),
                         text="Написать HR, если нет ответа")
            session.add(r)
            session.add(TrackerEvent(item_id=i.id, kind="reminder", payload={"text": r.text, "auto": True}))
        i.status = body.status
    if body.note is not None and body.note != i.note:
        i.note = body.note
        session.add(TrackerEvent(item_id=i.id, kind="note", payload={"text": body.note[:500]}))
    if body.position is not None:
        i.position = body.position
    i.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(i, ["reminders", "vacancy"])
    return _item(i, await get_rates(session, get_redis()), user)


@router.delete("/{item_id}", status_code=204)
async def delete(item_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    i = await _own(session, user, item_id)
    await session.delete(i)
    await session.commit()


@router.get("/{item_id}/events")
async def events(item_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    await _own(session, user, item_id)
    rows = (await session.execute(select(TrackerEvent).where(TrackerEvent.item_id == item_id).order_by(TrackerEvent.created_at.desc()))).scalars().all()
    return [{"id": e.id, "kind": e.kind, "payload": e.payload, "created_at": e.created_at.isoformat()} for e in rows]


@router.post("/{item_id}/reminders", status_code=201)
async def add_reminder(item_id: int, body: ReminderIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    i = await _own(session, user, item_id)
    r = Reminder(item_id=i.id, remind_at=body.remind_at, text=body.text)
    session.add(r)
    session.add(TrackerEvent(item_id=i.id, kind="reminder", payload={"text": body.text, "remind_at": body.remind_at.isoformat()}))
    await session.commit()
    return _rem(r)
