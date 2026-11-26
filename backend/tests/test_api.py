"""End-to-end API tests against a real Postgres + Redis seeded by `python -m app.bootstrap` (demo data).

Skipped automatically when the database is not reachable (plain `pytest` without services).
CI runs bootstrap first, then the whole suite.
"""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.db import ping_db

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def client():
    if not await ping_db():
        pytest.skip("database not available")
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/v1/vacancies", params={"limit": 1})
        if r.json().get("total", 0) == 0:
            pytest.skip("database is empty — run python -m app.bootstrap first")
        yield c


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def auth(client):
    email = f"t{uuid.uuid4().hex[:8]}@test.dev"
    r = await client.post("/api/v1/auth/register", json={"email": email, "password": "secret123"})
    assert r.status_code == 201, r.text
    tokens = r.json()
    return {"Authorization": f"Bearer {tokens['access_token']}", "_refresh": tokens["refresh_token"]}


def h(auth):
    return {"Authorization": auth["Authorization"]}


async def test_health_ready_metrics(client):
    assert (await client.get("/health")).json() == {"status": "ok"}
    ready = (await client.get("/ready")).json()
    assert ready["checks"] == {"db": True, "redis": True}
    metrics = (await client.get("/metrics")).text
    assert "jobs_collected_last_hour" in metrics


async def test_search_filters_and_cursor(client):
    r = (await client.get("/api/v1/vacancies", params={"limit": 5})).json()
    assert r["total"] > 100 and len(r["items"]) == 5 and r["next_cursor"]
    page2 = (await client.get("/api/v1/vacancies", params={"limit": 5, "cursor": r["next_cursor"]})).json()
    assert not {i["id"] for i in r["items"]} & {i["id"] for i in page2["items"]}

    seniors = (await client.get("/api/v1/vacancies", params={"grade": "senior", "limit": 50})).json()
    assert seniors["items"] and all(i["grade"] == "senior" for i in seniors["items"])

    by_salary = (await client.get("/api/v1/vacancies", params={"sort": "salary", "limit": 20})).json()["items"]
    tops = [i["salary"]["rub_to"] or i["salary"]["rub_from"] or 0 for i in by_salary]
    assert tops == sorted(tops, reverse=True)

    q = (await client.get("/api/v1/vacancies", params={"q": "python", "sort": "relevance", "limit": 10})).json()
    assert q["items"] and any("Python" in i["tags"] or "python" in i["title"].lower() for i in q["items"])


async def test_currency_conversion_filter(client):
    usd = (await client.get("/api/v1/vacancies", params={"salary_min": 3000, "currency": "USD", "limit": 30})).json()
    rub = (await client.get("/api/v1/vacancies", params={"salary_min": 3000 * 70, "currency": "RUB", "limit": 30})).json()
    assert 0 < usd["total"] <= rub["total"]
    assert usd["items"][0]["salary"]["display_currency"] == "USD"


async def test_vacancy_detail_dedup_and_ghost(client):
    items = (await client.get("/api/v1/vacancies", params={"limit": 100})).json()["items"]
    merged = next(i for i in items if len(i["sources"]) > 1)
    d = (await client.get(f"/api/v1/vacancies/{merged['id']}")).json()
    assert d["dedup"]["cluster_size"] >= 2 and d["dedup"]["merged"][1]["reason"]
    assert d["summary"] is not None and d["enrichment"]["method"] in ("rules", "llm")
    hidden = (await client.get("/api/v1/vacancies", params={"limit": 100, "hide_ghost": True})).json()
    assert hidden["total"] < (await client.get("/api/v1/vacancies", params={"limit": 1})).json()["total"]
    assert all(not i["is_ghost"] for i in hidden["items"])

    sim = (await client.get(f"/api/v1/vacancies/{merged['id']}/similar")).json()
    assert len(sim) <= 6 and merged["id"] not in {s["id"] for s in sim}


async def test_refresh_rotation_and_reuse_detection(client):
    r = await client.post("/api/v1/auth/register", json={"email": f"r{uuid.uuid4().hex[:8]}@t.dev", "password": "secret123"})
    t1 = r.json()
    t2 = (await client.post("/api/v1/auth/refresh", json={"refresh_token": t1["refresh_token"]})).json()
    assert t2["refresh_token"] != t1["refresh_token"]
    reuse = await client.post("/api/v1/auth/refresh", json={"refresh_token": t1["refresh_token"]})
    assert reuse.status_code == 401
    # the whole family is revoked after reuse
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": t2["refresh_token"]})).status_code == 401
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_profile_resume_and_match(client, auth):
    r = await client.post("/api/v1/profile/resume", headers=h(auth),
                          json={"text": "Python backend разработчик: FastAPI, Django, PostgreSQL, Redis, Docker, Kafka"})
    assert {"Python", "PostgreSQL", "Kafka"} <= set(r.json()["extracted_skills"])
    p = r.json()["profile"] | {"grade": "middle", "work_formats": ["remote"], "desired_salary": 250000,
                                "stop_words": ["1С"]}
    assert (await client.put("/api/v1/profile", headers=h(auth), json=p)).status_code == 200

    items = (await client.get("/api/v1/vacancies", headers=h(auth), params={"sort": "match", "limit": 10})).json()["items"]
    scores = [i["match_score"] for i in items]
    assert scores == sorted(scores, reverse=True) and scores[0] >= 60
    assert all("1с" not in i["title"].lower() for i in items)

    m = (await client.get(f"/api/v1/vacancies/{items[0]['id']}/match", headers=h(auth))).json()
    assert m["score"] == scores[0]
    assert {b["factor"] for b in m["breakdown"]} == {"skills", "grade", "salary", "format", "stop_words"}

    gap = (await client.get("/api/v1/analytics/skill-gap", headers=h(auth))).json()
    assert "suggestions" in gap and all(s["unlocks"] > 0 for s in gap["suggestions"])


async def test_tracker_state_machine_and_auto_reminder(client, auth):
    vid = (await client.get("/api/v1/vacancies", params={"limit": 1})).json()["items"][0]["id"]
    item = (await client.post("/api/v1/tracker", headers=h(auth), json={"vacancy_id": vid})).json()
    assert item["status"] == "saved"
    assert (await client.post("/api/v1/tracker", headers=h(auth), json={"vacancy_id": vid})).status_code == 409
    bad = await client.patch(f"/api/v1/tracker/{item['id']}", headers=h(auth), json={"status": "offer"})
    assert bad.status_code == 422
    ok = (await client.patch(f"/api/v1/tracker/{item['id']}", headers=h(auth),
                             json={"status": "applied", "note": "Откликнулся"})).json()
    assert ok["status"] == "applied" and ok["reminders"] and "HR" in ok["reminders"][0]["text"]
    kinds = [e["kind"] for e in (await client.get(f"/api/v1/tracker/{item['id']}/events", headers=h(auth))).json()]
    assert {"status", "reminder", "note"} <= set(kinds)
    board = (await client.get("/api/v1/tracker", headers=h(auth))).json()
    assert list(board["columns"]) == ["saved", "applied", "test_task", "interview", "offer", "rejected"]
    assert len(board["columns"]["applied"]) == 1


async def test_subscriptions_and_telegram_link(client, auth):
    s = (await client.post("/api/v1/subscriptions", headers=h(auth),
                           json={"name": "Python remote", "filters": {"tags": ["Python"], "format": ["remote"]}})).json()
    assert s["matched_last_24h"] >= 0 and s["mode"] == "instant"
    assert len((await client.get("/api/v1/subscriptions", headers=h(auth))).json()) == 1
    link = (await client.post("/api/v1/auth/telegram/link", headers=h(auth))).json()
    assert link["deep_link"].startswith("https://t.me/") and "?start=" in link["deep_link"]


async def test_analytics_market(client):
    m = (await client.get("/api/v1/analytics/market")).json()
    assert m["totals"]["vacancies"] > 100 and m["totals"]["merged_duplicates"] > 0 and m["totals"]["ghosts"] > 0
    assert m["top_skills"] and m["salary_by_grade"]
    g = {x["grade"]: x for x in m["salary_by_grade"]}
    assert g["junior"]["p50"] < g["senior"]["p50"]
    f = (await client.get("/api/v1/meta/filters")).json()
    assert f["grades"] and f["top_tags"] and f["sources"]


async def test_notifications_and_reminders_delivery(client, auth, monkeypatch):
    """Subscription matches and due reminders go to the linked Telegram chat, once."""
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import update

    from app import notify
    from app.db import SessionLocal
    from app.models import Reminder, Subscription, User

    sent: list[tuple[int, str, dict | None]] = []

    async def fake_send(chat_id, text, markup=None):
        sent.append((chat_id, text, markup))
        return True

    monkeypatch.setattr(notify, "tg_send", fake_send)
    me = (await client.get("/api/v1/auth/me", headers=h(auth))).json()
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.id == me["id"]).values(telegram_chat_id=777000 + me["id"]))
        await s.execute(update(Subscription).where(Subscription.user_id == me["id"])
                        .values(last_checked_at=datetime.now(UTC) - timedelta(days=30), min_match=None))
        await s.execute(update(Reminder).values(remind_at=datetime.now(UTC) - timedelta(minutes=1)))
        await s.commit()

    res = await notify.send_subscriptions()
    cards = [m for m in sent if m[1].startswith("🔔")]
    assert res["sent"] == len(cards) > 0
    assert cards[0][2]["inline_keyboard"][0][0]["callback_data"].startswith("fav:")
    assert "Совпадение" in cards[0][1]

    sent.clear()
    assert (await notify.send_subscriptions())["sent"] == 0  # no duplicates on the next tick

    rem = await notify.send_reminders()
    assert rem["reminders"] >= 1 and any("Напоминание" in m[1] for m in sent)


async def test_telegram_bot_linking_and_buttons(client, auth):
    """Bot handlers: deep-link binding, /status, ⭐ adds to tracker, 🙈 hides from search, /unlink."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from aiogram.filters import CommandObject

    from app import bot

    link = (await client.post("/api/v1/auth/telegram/link", headers=h(auth))).json()["deep_link"]
    token = link.split("start=")[1]
    chat_id = 990000 + int(uuid.uuid4().int % 1000)

    def msg():
        return SimpleNamespace(chat=SimpleNamespace(id=chat_id), answer=AsyncMock())

    m = msg()
    await bot.start(m, CommandObject(prefix="/", command="start", args="bad-token"))
    assert "недействительна" in m.answer.call_args.args[0]
    m = msg()
    await bot.start(m, CommandObject(prefix="/", command="start", args=token))
    assert "привязан" in m.answer.call_args.args[0]
    assert (await client.get("/api/v1/auth/me", headers=h(auth))).json()["telegram_linked"] is True
    m = msg()
    await bot.status(m)
    assert "Уведомления включены" in m.answer.call_args.args[0]

    items = (await client.get("/api/v1/vacancies", params={"limit": 3})).json()["items"]
    fav_id, hide_id = items[1]["id"], items[2]["id"]

    def cb(data):
        return SimpleNamespace(data=data, from_user=SimpleNamespace(id=chat_id), answer=AsyncMock(),
                               message=SimpleNamespace(delete=AsyncMock()))

    c = cb(f"fav:{fav_id}")
    await bot.on_button(c)
    assert "трекер" in c.answer.call_args.args[0]
    board = (await client.get("/api/v1/tracker", headers=h(auth))).json()["columns"]
    assert fav_id in {i["vacancy"]["id"] for col in board.values() for i in col}

    c = cb(f"hide:{hide_id}")
    await bot.on_button(c)
    c.message.delete.assert_awaited()
    ids = {i["id"] for i in (await client.get("/api/v1/vacancies", headers=h(auth), params={"limit": 100})).json()["items"]}
    assert hide_id not in ids

    m = msg()
    await bot.unlink(m)
    assert (await client.get("/api/v1/auth/me", headers=h(auth))).json()["telegram_linked"] is False


def test_circuit_breaker_opens_after_threshold():
    from app.worker import CircuitBreaker, settings

    try:
        cb = CircuitBreaker(f"test-{uuid.uuid4().hex[:6]}")
        cb.r.ping()
    except Exception:
        pytest.skip("redis not available")
    for _ in range(settings.circuit_breaker_threshold - 1):
        cb.failure()
    assert not cb.is_open()
    cb.failure()
    assert cb.is_open()
    cb.success()
    assert not cb.is_open()


def _signed_init_data(bot_token: str, user: dict, auth_date: int | None = None) -> str:
    import hashlib
    import hmac
    import json
    import time
    from urllib.parse import urlencode

    fields = {"auth_date": str(auth_date or int(time.time())), "query_id": "AAH1", "user": json.dumps(user)}
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


async def test_mini_app_sign_in(client, monkeypatch):
    """Telegram Mini App: valid initData signs in (creating the account once), tampered/expired data is rejected."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123456:TEST-token")
    tg_user = {"id": 5550000 + uuid.uuid4().int % 10000, "first_name": "Илим", "username": "ilim_test"}
    init = _signed_init_data("123456:TEST-token", tg_user)

    r = await client.post("/api/v1/auth/telegram/webapp", json={"init_data": init})
    assert r.status_code == 200, r.text
    me = (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})).json()
    assert me["telegram_linked"] and me["display_name"] == "Илим" and me["email"] is None

    again = await client.post("/api/v1/auth/telegram/webapp", json={"init_data": init})
    me2 = (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {again.json()['access_token']}"})).json()
    assert me2["id"] == me["id"]  # same account on every launch

    tampered = init.replace("ilim_test", "hacker")
    assert (await client.post("/api/v1/auth/telegram/webapp", json={"init_data": tampered})).status_code == 401
    old = _signed_init_data("123456:TEST-token", tg_user, auth_date=1_600_000_000)
    assert (await client.post("/api/v1/auth/telegram/webapp", json={"init_data": old})).status_code == 401
    forged = _signed_init_data("999:other-bot", tg_user)
    assert (await client.post("/api/v1/auth/telegram/webapp", json={"init_data": forged})).status_code == 401
