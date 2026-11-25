"""Shared async HTTP helper for collectors.

* per-source rate limiting (in-process lock + min interval; optional Redis-backed
  interval so several worker processes share one budget per source)
* User-Agent rotation
* retries with exponential backoff + jitter on 429 / 5xx / timeouts, honours Retry-After
* raises :class:`CollectorError` on 403 / final failure
"""

from __future__ import annotations

import asyncio
import html
import itertools
import logging
import random
import re
import time
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from tenacity import (
    AsyncRetrying,
    RetryCallState,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from app.collectors.base import CollectorError

log = logging.getLogger(__name__)

USER_AGENTS: list[str] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 YaBrowser/24.10.0.0 Safari/537.36",
]
_ua_cycle = itertools.cycle(random.sample(USER_AGENTS, len(USER_AGENTS)))

MAX_ATTEMPTS = 4
DEFAULT_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
RETRY_STATUSES = {429, 500, 502, 503, 504, 520, 522, 524}
MAX_RETRY_AFTER = 60.0


def next_user_agent() -> str:
    return next(_ua_cycle)


_BLOCK_TAG_RE = re.compile(r"<\s*(br|/p|/div|/h[1-6]|/ul|/ol|/blockquote|/tr)\b[^>]*>", re.I)
_LI_RE = re.compile(r"<\s*li\b[^>]*>", re.I)
_TAG_RE = re.compile(r"<[^>]+>")


def html_to_text(fragment: str) -> str:
    """Cheap HTML -> plain text preserving line breaks (shared by collectors, pure)."""
    s = _BLOCK_TAG_RE.sub("\n", fragment)
    s = _LI_RE.sub("\n• ", s)
    s = _TAG_RE.sub("", s)
    s = html.unescape(s).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in s.splitlines()]
    out: list[str] = []
    for ln in lines:
        if not ln and (not out or not out[-1]):
            continue
        out.append(ln)
    return "\n".join(out).strip()


class _RetryableHTTP(Exception):
    def __init__(self, status: int, retry_after: float | None, url: str) -> None:
        super().__init__(f"HTTP {status} for {url}")
        self.status = status
        self.retry_after = retry_after


# --------------------------------------------------------------------------- rate limit
class _SourceLimiter:
    def __init__(self) -> None:
        self.lock = asyncio.Lock()
        self.last = 0.0


_limiters: dict[str, _SourceLimiter] = {}
_client: httpx.AsyncClient | None = None
_last_seen: dict[str, float] = {}  # survives event-loop changes (celery runs asyncio.run per task)
_bound_loop: asyncio.AbstractEventLoop | None = None
_redis_client: Any = None


def set_redis(client: Any) -> None:
    """Optionally share the per-source interval across processes via Redis (redis.asyncio)."""
    global _redis_client
    _redis_client = client


async def _redis_wait(source_key: str, min_interval: float) -> None:
    """Cross-process slot reservation: SET NX PX acts as a 1-token bucket per source."""
    key = f"ratelimit:{source_key}"
    ms = max(int(min_interval * 1000), 1)
    for _ in range(int(60 / max(min_interval, 0.05)) + 1):
        try:
            if await _redis_client.set(key, "1", nx=True, px=ms):
                return
            ttl = await _redis_client.pttl(key)
        except Exception:  # redis down -> fall back to in-process only
            log.debug("redis rate limit unavailable", exc_info=True)
            return
        await asyncio.sleep(max(ttl, 50) / 1000 if ttl and ttl > 0 else 0.05)


async def _throttle(source_key: str, min_interval: float) -> None:
    _ensure_loop()
    lim = _limiters.setdefault(source_key, _SourceLimiter())
    async with lim.lock:
        wait = _last_seen.get(source_key, 0.0) + min_interval - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        if _redis_client is not None:
            await _redis_wait(source_key, min_interval)
        _last_seen[source_key] = time.monotonic()




def _ensure_loop() -> None:
    """Locks and the pooled client are loop-bound: rebuild them when the running loop changes."""
    global _bound_loop, _client
    loop = asyncio.get_running_loop()
    if loop is not _bound_loop:
        _bound_loop = loop
        _limiters.clear()
        _client = None


def _get_client() -> httpx.AsyncClient:
    global _client
    _ensure_loop()
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True, http2=False)
    return _client


async def aclose() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    value = value.strip()
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(value)
        return max(0.0, dt.timestamp() - time.time())
    except (TypeError, ValueError):
        return None


def _wait_strategy():
    base = wait_exponential_jitter(initial=1, max=20, jitter=1)

    def wait(rs: RetryCallState) -> float:
        exc = rs.outcome.exception() if rs.outcome else None
        if isinstance(exc, _RetryableHTTP) and exc.retry_after is not None:
            return min(exc.retry_after, MAX_RETRY_AFTER) + random.uniform(0, 0.5)
        return base(rs)

    return wait


async def fetch(
    source_key: str,
    url: str,
    *,
    params: dict[str, Any] | list[tuple[str, Any]] | None = None,
    headers: dict[str, str] | None = None,
    min_interval: float = 1.0,
    as_json: bool = False,
    timeout: float | None = None,
) -> Any:
    """GET ``url`` respecting the per-source rate limit. Returns text or parsed JSON."""
    client = _get_client()

    async def _once() -> Any:
        await _throttle(source_key, min_interval)
        h = {
            "User-Agent": next_user_agent(),
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            "Accept": "application/json, text/plain, */*" if as_json else "text/html,application/xhtml+xml,*/*;q=0.8",
        }
        if headers:
            h.update(headers)
        resp = await client.get(url, params=params, headers=h, timeout=timeout or DEFAULT_TIMEOUT)
        if resp.status_code in RETRY_STATUSES:
            raise _RetryableHTTP(resp.status_code, parse_retry_after(resp.headers.get("Retry-After")), url)
        if resp.status_code in (401, 403):
            raise CollectorError(f"{source_key}: HTTP {resp.status_code} (blocked/auth) for {url}")
        if resp.status_code >= 400:
            raise CollectorError(f"{source_key}: HTTP {resp.status_code} for {url}")
        if as_json:
            try:
                return resp.json()
            except ValueError as e:
                raise CollectorError(f"{source_key}: invalid JSON from {url}") from e
        return resp.text

    try:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(MAX_ATTEMPTS),
            wait=_wait_strategy(),
            retry=retry_if_exception_type((_RetryableHTTP, httpx.TimeoutException, httpx.TransportError)),
            reraise=True,
        ):
            with attempt:
                return await _once()
    except CollectorError:
        raise
    except (_RetryableHTTP, httpx.HTTPError) as e:
        raise CollectorError(f"{source_key}: giving up after {MAX_ATTEMPTS} attempts: {e!r}") from e
    raise CollectorError(f"{source_key}: unreachable")  # pragma: no cover
