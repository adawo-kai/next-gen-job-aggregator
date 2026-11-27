"""Per-client rate limiting for the whole API (Redis fixed window, fail-open).

Buckets are per client IP and per rule (path prefix + method); stricter rules for expensive calls.
The existing per-route auth limiter in api/auth.py stays as an extra guard against credential stuffing.
"""

from __future__ import annotations

import time

from fastapi import Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.deps import get_redis
from app.observability import log

# (path prefix, method or "*", limit per window, window seconds) — first match wins
RULES: list[tuple[str, str, int, int]] = [
    ("/api/v1/profile/resume", "POST", 10, 600),  # file parsing is the most expensive call
    ("/api/v1/auth/", "POST", 20, 60),  # sign-in / refresh / telegram link
    ("/api/v1/analytics/", "*", 30, 60),
    ("/api/v1/", "POST", 60, 60),
    ("/api/v1/", "PATCH", 60, 60),
    ("/api/v1/", "PUT", 30, 60),
    ("/api/v1/", "DELETE", 30, 60),
    ("/api/v1/", "*", 240, 60),  # reads: search, cards, tracker
]
EXEMPT = ("/health", "/ready", "/metrics", "/docs", "/openapi.json", "/redoc")


def client_ip(request: Request) -> str:
    """Real client IP. Headers are only trusted when configured: a client could otherwise spoof them.

    Behind Caddy, uvicorn --proxy-headers already resolves X-Forwarded-For into request.client.
    Behind a Cloudflare tunnel set REAL_IP_HEADER=cf-connecting-ip.
    """
    header = get_settings().real_ip_header
    if header and (ip := request.headers.get(header)):
        return ip.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rule(path: str, method: str) -> tuple[str, int, int] | None:
    for prefix, m, limit, window in RULES:
        if path.startswith(prefix) and (m == "*" or m == method):
            return f"{prefix}:{m}", limit, window
    return None


async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if not get_settings().rate_limit_enabled or request.method == "OPTIONS" or path.startswith(EXEMPT):
        return await call_next(request)
    rule = _rule(path, request.method)
    if rule is None:
        return await call_next(request)
    name, limit, window = rule
    bucket = int(time.time() // window)
    subject = client_ip(request)
    key = f"rl2:{name}:{subject}:{bucket}"
    try:
        r = get_redis()
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window + 1)
        count, _ = await pipe.execute()
    except Exception:  # Redis down: never take the API down with the limiter
        return await call_next(request)
    if count > limit:
        retry = window - int(time.time()) % window
        if count == limit + 1:
            log.warning("rate_limited", rule=name, ip=subject, limit=limit, window=window)
        return JSONResponse(
            {"detail": "Слишком много запросов, попробуйте чуть позже"},
            status_code=429,
            headers={"Retry-After": str(retry), "X-RateLimit-Limit": str(limit)},
        )
    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(max(limit - count, 0))
    return response
