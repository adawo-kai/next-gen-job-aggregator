"""Async delivery of subscription matches and tracker reminders to Telegram (Bot API over httpx)."""

from __future__ import annotations

import html
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.config import get_settings
from app.observability import NOTIFICATIONS, log

GRADE_RU = {"intern": "Стажёр", "junior": "Junior", "middle": "Middle", "senior": "Senior", "lead": "Lead"}
FORMAT_RU = {"remote": "Удалёнка", "hybrid": "Гибрид", "office": "Офис"}


def fmt_salary(v) -> str:
    f, t = v.salary_rub_from, v.salary_rub_to
    if not f and not t:
        return "з/п не указана"
    pre = "≈ " if v.salary_estimated else ""
    if f and t and f != t:
        return f"{pre}{f:,}–{t:,} ₽".replace(",", " ")
    return f"{pre}{(f or t):,} ₽".replace(",", " ")


def render_card(v, score: int | None = None) -> str:
    e = html.escape
    parts = [f"<b>{e(v.title)}</b>", f"🏢 {e(v.company.name if v.company else '—')}"]
    meta = [x for x in [GRADE_RU.get(v.grade or ""), FORMAT_RU.get(v.work_format or ""), v.city] if x]
    parts.append(f"💰 {fmt_salary(v)}" + (f" · {' · '.join(map(e, meta))}" if meta else ""))
    if score is not None:
        parts.append(f"🎯 Совпадение: <b>{score}%</b>")
    if v.tags:
        parts.append("🧩 " + ", ".join(map(e, v.tags[:8])))
    if v.summary and v.summary.get("what_to_do"):
        parts.append("📌 " + e(v.summary["what_to_do"][0]))
    if v.red_flags:
        parts.append("🚩 " + ", ".join(e(f["title"]) for f in v.red_flags[:3]))
    if v.is_ghost:
        parts.append("👻 Подозрение на вечный поиск")
    if len(v.sources or []) > 1:
        parts.append(f"🔗 Найдено на {len(v.sources)} площадках")
    return "\n".join(parts)


def keyboard(v) -> dict:
    url = v.links[0].url if v.links else None
    rows = [[{"text": "⭐ В избранное", "callback_data": f"fav:{v.id}"}, {"text": "🙈 Скрыть", "callback_data": f"hide:{v.id}"}]]
    if url:
        rows.append([{"text": "Открыть вакансию ↗", "url": url}])
    return {"inline_keyboard": rows}


async def tg_send(chat_id: int, text: str, markup: dict | None = None) -> bool:
    token = get_settings().telegram_bot_token
    if not token:
        return False
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup:
        payload["reply_markup"] = markup
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"https://api.telegram.org/bot{token}/sendMessage", json=payload)
    if r.status_code != 200:
        log.warning("tg_send_failed", status=r.status_code, body=r.text[:200])
    return r.status_code == 200


async def send_subscriptions() -> dict:
    from app.db import worker_sessionmaker
    from app.models import NotificationSent, Subscription, User
    from app.pipeline.currency import get_rates
    from app.pipeline.match import compute
    from app.search import SearchParams, build_query
    from app.serializers import profile_view, vacancy_view

    sent = 0
    async with worker_sessionmaker()() as s:
        rates = await get_rates(s, None)
        subs = (await s.execute(select(Subscription, User).join(User, User.id == Subscription.user_id)
                                .where(Subscription.active.is_(True), User.telegram_chat_id.is_not(None)))).all()
        for sub, user in subs:
            now = datetime.now(UTC)
            if sub.mode == "digest" and sub.last_checked_at and (now - sub.last_checked_at).total_seconds() < 86400:
                continue
            p = SearchParams.from_filters(sub.filters or {})
            p.created_after = sub.last_checked_at or now
            q, _ = build_query(p, rates, user)
            already = select(NotificationSent.vacancy_id).where(NotificationSent.user_id == user.id)
            from app.models import Vacancy

            vacs = (await s.execute(q.where(Vacancy.id.not_in(already)).order_by(Vacancy.published_at.desc()).limit(20))).scalars().all()
            pv = profile_view(user, rates)
            batch = []
            for v in vacs:
                score = compute(pv, vacancy_view(v)).score if (user.skills or user.grade) else None
                if sub.min_match and (score or 0) < sub.min_match:
                    continue
                batch.append((v, score))
            if sub.mode == "digest" and batch:
                lines = [f"📬 <b>Дайджест «{html.escape(sub.name)}»</b>: {len(batch)} новых"]
                lines += [f"• {html.escape(v.title)} — {fmt_salary(v)}" + (f" · {sc}%" if sc is not None else "") for v, sc in batch[:15]]
                if await tg_send(user.telegram_chat_id, "\n".join(lines)):
                    NOTIFICATIONS.labels("digest").inc()
            else:
                for v, sc in batch[:10]:
                    if await tg_send(user.telegram_chat_id, f"🔔 <i>{html.escape(sub.name)}</i>\n\n" + render_card(v, sc), keyboard(v)):
                        NOTIFICATIONS.labels("instant").inc()
                        sent += 1
            for v, _ in batch:
                await s.execute(insert(NotificationSent).values(user_id=user.id, vacancy_id=v.id, subscription_id=sub.id).on_conflict_do_nothing())
            sub.last_checked_at = now
        await s.commit()
    return {"sent": sent}


async def send_reminders() -> dict:
    from app.db import worker_sessionmaker
    from app.models import Reminder, TrackerItem, User

    n = 0
    async with worker_sessionmaker()() as s:
        rows = (await s.execute(
            select(Reminder, TrackerItem, User).join(TrackerItem, TrackerItem.id == Reminder.item_id)
            .join(User, User.id == TrackerItem.user_id)
            .where(Reminder.sent.is_(False), Reminder.remind_at <= datetime.now(UTC))
            .limit(100)
        )).all()
        for rem, item, user in rows:
            if user.telegram_chat_id:
                text = f"⏰ <b>Напоминание</b>\n{html.escape(rem.text)}\n\n📄 {html.escape(item.vacancy.title)}"
                if await tg_send(user.telegram_chat_id, text):
                    NOTIFICATIONS.labels("reminder").inc()
            rem.sent = True
            n += 1
        await s.commit()
    return {"reminders": n}
