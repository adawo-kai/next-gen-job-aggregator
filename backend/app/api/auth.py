from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.deps import get_redis
from app.models import User
from app.ratelimit import client_ip
from app.security import current_user, hash_password, issue_tokens, rotate_refresh, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)  # login: any length (older accounts)


COMMON_PASSWORDS = {
    "12345678", "123456789", "1234567890", "password", "password1", "qwerty123", "qwertyui", "11111111",
    "00000000", "iloveyou", "1q2w3e4r", "1qaz2wsx", "qwerty12", "abcd1234", "passw0rd", "12341234",
    "87654321", "йцукенгш", "пароль123", "admin123",
}


class RegisterIn(Credentials):
    password: str = Field(min_length=8, max_length=128)  # same rule as reset/change

    @field_validator("password")
    @classmethod
    def not_common(cls, v: str) -> str:
        if v.lower() in COMMON_PASSWORDS:
            raise ValueError("Слишком простой пароль — придумайте другой")
        return v


class RefreshIn(BaseModel):
    refresh_token: str


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


async def _rate_limit(request: Request, key: str, limit: int = 10, window: int = 60) -> None:
    """Fixed-window limiter in Redis against credential stuffing."""
    if not get_settings().rate_limit_enabled:
        return
    try:
        r = get_redis()
        k = f"rl:{key}:{client_ip(request)}"
        n = await r.incr(k)
        if n == 1:
            await r.expire(k, window)
        if n > limit:
            raise HTTPException(429, "Слишком много попыток, попробуйте через минуту")
    except HTTPException:
        raise
    except Exception:
        pass  # limiter must never take auth down


@router.post("/register", response_model=TokensOut, status_code=201)
async def register(body: RegisterIn, request: Request, session: AsyncSession = Depends(get_session)):
    await _rate_limit(request, "register")
    if await session.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Этот email уже зарегистрирован — войдите или восстановите пароль")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), work_formats=[], skills=[], stop_words=[], hidden_vacancies=[])
    session.add(user)
    await session.flush()
    return await issue_tokens(session, user)


@router.post("/login", response_model=TokensOut)
async def login(body: Credentials, request: Request, session: AsyncSession = Depends(get_session)):
    await _rate_limit(request, "login")
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Неверный email или пароль")
    return await issue_tokens(session, user)


@router.post("/refresh", response_model=TokensOut)
async def refresh(body: RefreshIn, session: AsyncSession = Depends(get_session)):
    return await rotate_refresh(session, body.refresh_token)


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": None if user.email.endswith(TG_EMAIL_DOMAIN) else user.email,
            "telegram_linked": user.telegram_chat_id is not None, "display_name": user.display_name,
            "telegram_username": user.telegram_username, "photo_url": user.photo_url,
            "created_at": user.created_at.isoformat()}


# ------------------------------------------------------------------ Telegram Mini App sign-in
TG_EMAIL_DOMAIN = "@telegram.user"


class WebAppIn(BaseModel):
    init_data: str = Field(min_length=10, max_length=8192)


def verify_init_data(init_data: str, bot_token: str, ttl: int) -> dict:
    """Validate Telegram WebApp initData (HMAC-SHA256, key = HMAC("WebAppData", bot_token)).

    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=False))
    received = pairs.pop("hash", None)
    if not received:
        raise HTTPException(401, "Не удалось проверить вход из Telegram, откройте приложение заново")
    check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise HTTPException(401, "Не удалось проверить вход из Telegram, откройте приложение заново")
    auth_date = int(pairs.get("auth_date", "0") or 0)
    if ttl and time.time() - auth_date > ttl:
        raise HTTPException(401, "Сессия Telegram устарела, откройте приложение заново")
    try:
        pairs["user"] = json.loads(pairs.get("user", "{}"))
    except ValueError:
        raise HTTPException(401, "Не удалось проверить вход из Telegram, откройте приложение заново")
    if not pairs["user"].get("id"):
        raise HTTPException(401, "Не удалось проверить вход из Telegram, откройте приложение заново")
    return pairs


@router.post("/telegram/webapp", response_model=TokensOut, summary="Sign in from Telegram Mini App (initData)")
async def telegram_webapp(body: WebAppIn, request: Request, session: AsyncSession = Depends(get_session)):
    s = get_settings()
    if not s.telegram_bot_token:
        raise HTTPException(503, "Вход через Telegram временно недоступен")
    await _rate_limit(request, "tg-webapp", limit=30)
    data = verify_init_data(body.init_data, s.telegram_bot_token, s.tg_init_data_ttl_seconds)
    tg = data["user"]
    tg_id = int(tg["id"])
    name = " ".join(x for x in (tg.get("first_name"), tg.get("last_name")) if x).strip() or None
    user = await session.scalar(select(User).where(User.telegram_chat_id == tg_id))
    if user is None:
        # first launch: an account keyed by Telegram id (private chat id == user id), no password login
        user = User(email=f"tg{tg_id}{TG_EMAIL_DOMAIN}", password_hash=hash_password(secrets.token_urlsafe(32)),
                    telegram_chat_id=tg_id, work_formats=[], skills=[], stop_words=[], hidden_vacancies=[])
        session.add(user)
    user.display_name = name or user.display_name
    user.telegram_username = tg.get("username") or user.telegram_username
    user.photo_url = tg.get("photo_url") or user.photo_url
    await session.flush()
    return await issue_tokens(session, user)


@router.post("/telegram/link")
async def telegram_link(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """One-time deep-link token: user opens t.me/<bot>?start=<token>, bot binds chat_id."""
    token = secrets.token_urlsafe(16)
    user.tg_link_token = token
    user.tg_link_expires = datetime.now(UTC) + timedelta(minutes=15)
    await session.commit()
    return {"deep_link": f"https://t.me/{get_settings().telegram_bot_username}?start={token}",
            "expires_at": user.tg_link_expires.isoformat()}
