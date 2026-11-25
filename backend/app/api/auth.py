from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.deps import get_redis
from app.models import User
from app.security import current_user, hash_password, issue_tokens, rotate_refresh, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


async def _rate_limit(request: Request, key: str, limit: int = 10, window: int = 60) -> None:
    """Fixed-window limiter in Redis against credential stuffing."""
    try:
        r = get_redis()
        k = f"rl:{key}:{request.client.host if request.client else 'x'}"
        n = await r.incr(k)
        if n == 1:
            await r.expire(k, window)
        if n > limit:
            raise HTTPException(429, "Too many attempts, try later")
    except HTTPException:
        raise
    except Exception:
        pass  # limiter must never take auth down


@router.post("/register", response_model=TokensOut, status_code=201)
async def register(body: Credentials, request: Request, session: AsyncSession = Depends(get_session)):
    await _rate_limit(request, "register")
    if await session.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email already registered")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), work_formats=[], skills=[], stop_words=[], hidden_vacancies=[])
    session.add(user)
    await session.flush()
    return await issue_tokens(session, user)


@router.post("/login", response_model=TokensOut)
async def login(body: Credentials, request: Request, session: AsyncSession = Depends(get_session)):
    await _rate_limit(request, "login")
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return await issue_tokens(session, user)


@router.post("/refresh", response_model=TokensOut)
async def refresh(body: RefreshIn, session: AsyncSession = Depends(get_session)):
    return await rotate_refresh(session, body.refresh_token)


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "telegram_linked": user.telegram_chat_id is not None,
            "created_at": user.created_at.isoformat()}


@router.post("/telegram/link")
async def telegram_link(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """One-time deep-link token: user opens t.me/<bot>?start=<token>, bot binds chat_id."""
    token = secrets.token_urlsafe(16)
    user.tg_link_token = token
    user.tg_link_expires = datetime.now(UTC) + timedelta(minutes=15)
    await session.commit()
    return {"deep_link": f"https://t.me/{get_settings().telegram_bot_username}?start={token}",
            "expires_at": user.tg_link_expires.isoformat()}
