from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models import RefreshToken, User

_ph = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)
ALGO = "HS256"


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except VerifyMismatchError:
        return False


def _encode(payload: dict) -> str:
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGO)


async def issue_tokens(session: AsyncSession, user: User, family: str | None = None) -> dict:
    s = get_settings()
    now = datetime.now(UTC)
    access = _encode({"sub": str(user.id), "type": "access", "iat": now, "exp": now + timedelta(seconds=s.access_ttl_seconds)})
    jti = secrets.token_hex(16)
    family = family or secrets.token_hex(16)
    exp = now + timedelta(days=s.refresh_ttl_days)
    refresh = _encode({"sub": str(user.id), "type": "refresh", "jti": jti, "fam": family, "exp": exp})
    session.add(RefreshToken(user_id=user.id, jti=jti, family=family, expires_at=exp))
    await session.commit()
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer", "expires_in": s.access_ttl_seconds}


async def rotate_refresh(session: AsyncSession, token: str) -> dict:
    """Refresh rotation with reuse detection: a used token presented again revokes the whole family."""
    try:
        data = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    if data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
    row = await session.scalar(select(RefreshToken).where(RefreshToken.jti == data["jti"]))
    if row is None or row.revoked:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token revoked")
    if row.used:
        await session.execute(update(RefreshToken).where(RefreshToken.family == row.family).values(revoked=True))
        await session.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token reuse detected; session revoked")
    row.used = True
    user = await session.get(User, row.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return await issue_tokens(session, user, family=row.family)


async def _user_from_creds(creds: HTTPAuthorizationCredentials | None, session: AsyncSession) -> User | None:
    if creds is None:
        return None
    try:
        data = jwt.decode(creds.credentials, get_settings().jwt_secret, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    if data.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
    return await session.get(User, int(data["sub"]))


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await _user_from_creds(creds, session)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user


async def optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    try:
        return await _user_from_creds(creds, session)
    except HTTPException:
        return None
