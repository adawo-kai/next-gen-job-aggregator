"""Account lifecycle: password reset/change, logout (one / all devices), data export, account deletion."""

from __future__ import annotations

import hashlib
import html
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import jwt

from app.api.auth import TG_EMAIL_DOMAIN, TokensOut, _rate_limit
from app.config import get_settings
from app.db import get_session
from app.mailer import send_mail
from app.models import (
    NotificationSent,
    PasswordReset,
    RefreshToken,
    Subscription,
    TrackerEvent,
    TrackerItem,
    User,
)
from app.observability import log
from app.security import ALGO, current_user, hash_password, issue_tokens, revoke_all_sessions, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
RESET_TTL = timedelta(hours=1)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class ChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class LogoutIn(BaseModel):
    refresh_token: str


class DeleteIn(BaseModel):
    confirm: str


@router.post("/password/forgot", status_code=202, summary="Send a password reset link (no user enumeration)")
async def forgot(body: ForgotIn, request: Request, session: AsyncSession = Depends(get_session)):
    await _rate_limit(request, "pwd-forgot", limit=5, window=900)
    email = body.email.lower()
    user = await session.scalar(select(User).where(User.email == email))
    if user is not None and not user.email.endswith(TG_EMAIL_DOMAIN):
        token = secrets.token_urlsafe(32)
        session.add(PasswordReset(user_id=user.id, token_hash=_hash(token), expires_at=datetime.now(UTC) + RESET_TTL))
        await session.commit()
        link = f"{get_settings().public_url.rstrip('/')}/reset-password?token={token}"
        text = (f"Здравствуйте!\n\nКто-то (надеемся, вы) запросил сброс пароля на JobRadar.\n"
                f"Ссылка действует 1 час:\n{link}\n\nЕсли это были не вы — просто проигнорируйте письмо.")
        page = (f"<p>Здравствуйте!</p><p>Кто-то (надеемся, вы) запросил сброс пароля на JobRadar.</p>"
                f"<p><a href=\"{html.escape(link)}\">Задать новый пароль</a> — ссылка действует 1 час.</p>"
                f"<p style=\"color:#888\">Если это были не вы — просто проигнорируйте письмо.</p>")
        await send_mail(user.email, "Сброс пароля JobRadar", text, page)
    # same answer whether the e-mail exists or not
    return {"ok": True}


@router.post("/password/reset", response_model=TokensOut, summary="Set a new password with a reset token")
async def reset(body: ResetIn, request: Request, session: AsyncSession = Depends(get_session)):
    await _rate_limit(request, "pwd-reset", limit=10, window=900)
    row = await session.scalar(select(PasswordReset).where(PasswordReset.token_hash == _hash(body.token)))
    if row is None or row.used or row.expires_at < datetime.now(UTC):
        raise HTTPException(400, "Ссылка недействительна или устарела — запросите новую")
    user = await session.get(User, row.user_id)
    if user is None:
        raise HTTPException(400, "Ссылка недействительна")
    row.used = True
    await session.execute(update(PasswordReset).where(PasswordReset.user_id == user.id).values(used=True))
    user.password_hash = hash_password(body.password)
    await revoke_all_sessions(session, user)
    log.info("password_reset", user_id=user.id)
    return await issue_tokens(session, user)


@router.post("/password/change", response_model=TokensOut, summary="Change password; other sessions are revoked")
async def change(body: ChangeIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if user.email.endswith(TG_EMAIL_DOMAIN):
        raise HTTPException(400, "У аккаунта Telegram нет пароля")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Текущий пароль неверный")
    user.password_hash = hash_password(body.new_password)
    await revoke_all_sessions(session, user)
    return await issue_tokens(session, user)


@router.post("/logout", status_code=204, summary="Revoke this session (its refresh-token family)")
async def logout(body: LogoutIn, session: AsyncSession = Depends(get_session)):
    try:
        data = jwt.decode(body.refresh_token, get_settings().jwt_secret, algorithms=[ALGO],
                          options={"verify_exp": False})
    except jwt.PyJWTError:
        return Response(status_code=204)
    if fam := data.get("fam"):
        await session.execute(update(RefreshToken).where(RefreshToken.family == fam).values(revoked=True))
        await session.commit()
    return Response(status_code=204)


@router.post("/logout-all", status_code=204, summary="Log out on every device")
async def logout_all(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    await revoke_all_sessions(session, user)
    await session.commit()
    return Response(status_code=204)


@router.get("/me/export", summary="Download all personal data (JSON)")
async def export(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    items = (await session.execute(select(TrackerItem).where(TrackerItem.user_id == user.id))).scalars().unique().all()
    events = {}
    if items:
        rows = (await session.execute(select(TrackerEvent).where(TrackerEvent.item_id.in_([i.id for i in items])))).scalars().all()
        for e in rows:
            events.setdefault(e.item_id, []).append({"kind": e.kind, "payload": e.payload, "at": e.created_at.isoformat()})
    subs = (await session.execute(select(Subscription).where(Subscription.user_id == user.id))).scalars().all()
    data = {
        "exported_at": datetime.now(UTC).isoformat(),
        "account": {
            "id": user.id, "email": None if user.email.endswith(TG_EMAIL_DOMAIN) else user.email,
            "created_at": user.created_at.isoformat(), "telegram_id": user.telegram_chat_id,
            "telegram_username": user.telegram_username, "display_name": user.display_name,
        },
        "profile": {
            "desired_salary": user.desired_salary, "currency": user.currency, "grade": user.grade,
            "work_formats": user.work_formats, "skills": user.skills, "stop_words": user.stop_words,
            "city": user.city, "hidden_vacancies": user.hidden_vacancies,
        },
        "tracker": [
            {"vacancy": {"id": i.vacancy.id, "title": i.vacancy.title,
                         "links": [link.url for link in i.vacancy.links]},
             "status": i.status, "note": i.note, "updated_at": i.updated_at.isoformat() if i.updated_at else None,
             "reminders": [{"at": r.remind_at.isoformat(), "text": r.text, "sent": r.sent} for r in i.reminders],
             "events": events.get(i.id, [])}
            for i in items
        ],
        "subscriptions": [{"name": s.name, "filters": s.filters, "mode": s.mode, "min_match": s.min_match,
                           "active": s.active} for s in subs],
    }
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="jobradar-data.json"'})


@router.delete("/me", status_code=204, summary="Delete the account and all personal data, immediately")
async def delete_me(body: DeleteIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if body.confirm.strip().upper() not in ("УДАЛИТЬ", "DELETE"):
        raise HTTPException(400, "Подтвердите удаление словом УДАЛИТЬ")
    uid = user.id
    # rows without FK cascade first; tracker, reminders, events, subscriptions, tokens cascade with the user
    await session.execute(delete(NotificationSent).where(NotificationSent.user_id == uid))
    await session.delete(user)
    await session.commit()
    log.info("account_deleted", user_id=uid)
    return Response(status_code=204)
