# Прогресс (обновлено 25.11.2026, ~13:15)

## Как запустить

```bash
cd "C:\Users\user\Desktop\projects\Next-Gen Job Aggregator"
docker compose up -d          # всё, включая web (образ фронта собран)
```

Адреса: http://localhost:3000 (UI), http://localhost:8000/docs (Swagger), http://localhost:3001 (Grafana), http://localhost:5555 (Flower).
Демо-пользователь в локальной БД: `demo@jobs.dev` / `demo1234` (профиль, трекер, подписка «Python remote»).

## Готово и проверено
- Бэкенд целиком, 57 тестов проходят. Live-сбор: Habr и Telegram, 0 ошибок. hh.ru выключен, нужен `HH_ACCESS_TOKEN`.
- Дедуп: precision 0.924, recall 0.943, F1 0.933. «Вечные» вакансии: 15 из 15.
- Фронт проверен в браузере на **реальном** бэкенде: главная, вакансия, трекер, профиль, аналитика. Исправлены логотипы (растягивались) и подпись «unknown» в форматах.
- Docker-образ `web` собирается: в `next.config.ts` добавлено `experimental.cpus=1`. `docker compose up` поднимает всё.

## Осталось
1. Живая проверка бота (Илим): открыть deep link из профиля → /start → карточки по подписке → кнопки. Логика бота уже покрыта тестами.
2. Опционально: токен hh.ru (dev.hh.ru), Claude API ключ, pgvector-поиск.

## Сделано 26.11
- Фильтр релевантности (не-IT вакансии), валидация заголовков/компаний Telegram, «похожие» по роли+стеку+грейду.
- Alembic (0001_initial_schema), bootstrap делает upgrade или stamp старой БД.
- 102 теста (unit + API integration), ~80% покрытия, CI с порогами покрытия и качества дедупа.
- Проверка «как у жюри»: git clone → docker compose up в чистой папке без .env — всё поднялось.
- Скриншоты в README; фиксы фронта: отключён массовый prefetch ленты, подписи перцентилей не налезают.

## Важно
- Диск C: почти полный: см. memory `machine-disk-constraint`. Копия фронта для локальной сборки лежит на `D:\nja-build\frontend`.
- `.env` содержит токен бота @NextGenJobAgr_bot, не коммитить.
