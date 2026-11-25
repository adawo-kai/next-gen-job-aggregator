"""Telegram bot (aiogram 3): account linking via deep link + inline buttons «В избранное» / «Скрыть»."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import CallbackQuery, Message
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models import TrackerEvent, TrackerItem, User, Vacancy
from app.observability import log, setup_logging

dp = Dispatcher()
WEB = "http://localhost:3000"


async def _user_by_chat(s, chat_id: int) -> User | None:
    return await s.scalar(select(User).where(User.telegram_chat_id == chat_id))


@dp.message(CommandStart())
async def start(m: Message, command: CommandObject):
    token = (command.args or "").strip()
    async with SessionLocal() as s:
        if token:
            u = await s.scalar(select(User).where(User.tg_link_token == token))
            if u is None or (u.tg_link_expires and u.tg_link_expires < datetime.now(UTC)):
                await m.answer("⚠️ Ссылка недействительна или устарела. Сгенерируйте новую в профиле.")
                return
            old = await _user_by_chat(s, m.chat.id)
            if old and old.id != u.id:
                old.telegram_chat_id = None
            u.telegram_chat_id, u.tg_link_token, u.tg_link_expires = m.chat.id, None, None
            await s.commit()
            await m.answer(f"✅ Аккаунт <b>{u.email}</b> привязан.\nНовые подходящие вакансии по вашим подпискам будут приходить сюда.", parse_mode="HTML")
            return
    await m.answer(
        "👋 Это бот <b>Next-Gen Job Aggregator</b>.\n\nЧтобы получать уведомления, откройте профиль на сайте и нажмите "
        "«Привязать Telegram».\n\n/status — статус привязки\n/unlink — отвязать", parse_mode="HTML")


@dp.message(Command("status"))
async def status(m: Message):
    async with SessionLocal() as s:
        u = await _user_by_chat(s, m.chat.id)
    await m.answer(f"🔗 Привязан к {u.email}" if u else "Аккаунт не привязан.")


@dp.message(Command("unlink"))
async def unlink(m: Message):
    async with SessionLocal() as s:
        u = await _user_by_chat(s, m.chat.id)
        if u:
            u.telegram_chat_id = None
            await s.commit()
    await m.answer("Отвязано. Уведомления больше не придут.")


@dp.callback_query(F.data.startswith(("fav:", "hide:")))
async def on_button(cb: CallbackQuery):
    action, vid = cb.data.split(":", 1)
    vid_i = int(vid)
    async with SessionLocal() as s:
        u = await _user_by_chat(s, cb.from_user.id)
        if u is None or await s.get(Vacancy, vid_i) is None:
            await cb.answer("Аккаунт не привязан", show_alert=True)
            return
        if action == "fav":
            exists = await s.scalar(select(TrackerItem).where(TrackerItem.user_id == u.id, TrackerItem.vacancy_id == vid_i))
            if not exists:
                it = TrackerItem(user_id=u.id, vacancy_id=vid_i, status="saved")
                s.add(it)
                await s.flush()
                s.add(TrackerEvent(item_id=it.id, kind="status", payload={"from": None, "to": "saved", "via": "telegram"}))
            await s.commit()
            await cb.answer("⭐ Добавлено в трекер")
        else:
            if vid_i not in (u.hidden_vacancies or []):
                u.hidden_vacancies = [*(u.hidden_vacancies or []), vid_i]
                await s.commit()
            await cb.answer("Скрыто — больше не покажем")
            try:
                await cb.message.delete()
            except Exception:
                pass


async def main():
    setup_logging("bot")
    token = get_settings().telegram_bot_token
    if not token:
        log.warning("bot_disabled_no_token")
        while True:  # keep container healthy but idle
            await asyncio.sleep(3600)
    bot = Bot(token)
    log.info("bot_started")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
