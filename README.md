# Next-Gen Job Aggregator
n[![CI](https://github.com/adawo-kai/next-gen-job-aggregator/actions/workflows/ci.yml/badge.svg)](https://github.com/adawo-kai/next-gen-job-aggregator/actions/workflows/ci.yml)

Умный агрегатор IT-вакансий. Он собирает вакансии из hh.ru, Habr Карьеры и Telegram-каналов, **склеивает одну и ту же вакансию с разных площадок в одну карточку**, извлекает стек, грейд, саммари и красные флаги, оценивает «воду», считает **объяснимый Match Score** с профилем кандидата и помечает **«вечные» вакансии**. Есть канбан-трекер откликов и Telegram-бот с уведомлениями.

```bash
cp .env.example .env      # всё опционально: без ключей проект работает на demo-данных и rules-движке
docker compose up -d --build
```

| Что | Где |
|---|---|
| Веб-интерфейс | http://localhost:3000 |
| Swagger / OpenAPI | http://localhost:8000/docs |
| Health / Ready / Metrics | `/health`, `/ready`, `/metrics` |
| Grafana (дашборд сбора) | http://localhost:3001 |
| Flower (очереди Celery) | http://localhost:5555 |
| Prometheus | http://localhost:9090 |

## Архитектура

```
                 ┌──────────── Celery beat (каждые 20 мин) ────────────┐
                 ▼                       ▼                    ▼
  queue collect.habr      queue collect.telegram     queue collect.hh      ← изоляция: своя очередь
  + circuit breaker        + circuit breaker          + circuit breaker       и свой breaker на источник
                 └───────────────┬───────────────────────────┘
                                 ▼
     raw_vacancies (JSONB) → normalize → DEDUP (3 ступени) → canonical vacancy + vacancy_sources
                                 ▼
          queue pipeline: enrich (LLM | rules) → salary estimate → company trust score
                                 ▼
          queue notify: subscriptions → Telegram карточки [⭐ В избранное] [🙈 Скрыть]; reminders
                                 ▼
     FastAPI (REST, JWT) ← Redis cache (поиск, курсы ЦБ, фильтры) → Next.js UI
```

Сервисы в `docker-compose.yml`: `postgres` (pgvector + pg_trgm), `redis`, `bootstrap` (схема, FTS-триггер, курсы, демо-сид), `api`, `worker-collect`, `worker-pipeline`, `beat`, `bot`, `flower`, `prometheus`, `grafana`, `web`.

## Как закрыто ТЗ и что сверх

| Пункт ТЗ | Реализация | Сверх ТЗ |
|---|---|---|
| Модульные коллекторы | `BaseCollector` + `@register("key")`. Новый источник: один файл | demo-коллектор: проект запускается без сети и ключей |
| hh.ru API | `collectors/hh.py` | hh теперь отдаёт 403 анонимам; коллектор включается при `HH_ACCESS_TOKEN`, остальные источники не страдают |
| Веб-скрапинг | Habr Карьера (`collectors/habr.py`) | |
| Telegram | веб-превью `t.me/s/<channel>`, без авторизации | эвристики: зарплата, компания, формат, грейд |
| Расписание и очереди | Celery beat + Redis, очередь на каждый источник | circuit breaker в Redis, журнал `collector_runs` |
| Rate limit, UA, retry | `collectors/http.py`: интервал на источник, ротация UA, экспоненциальный backoff с jitter, учёт Retry-After | |
| Дедупликация | 1) точный fingerprint; 2) отбор кандидатов через `pg_trgm`; 3) скоринг: заголовок, текст, навыки, зарплата, город | у каждой склейки сохранены **причина и score**; есть **оценка precision/recall** (см. ниже) |
| LLM-обогащение | Claude через tool use (строгая JSON-схема), Pydantic-валидация, повтор при невалидном ответе | **rules-движок** как фолбэк; кэш по content hash; учёт стоимости; дневной бюджет; версия промпта |
| Стек, грейд, саммари, флаги | `pipeline/enrich.py` | **water score 0–100**, словарь синонимов навыков (k8s → Kubernetes, «постгрес» → PostgreSQL) |
| Match Score | `pipeline/match.py`, веса: навыки, грейд, зарплата, формат, стоп-слова | **объяснение по факторам**, must-have против nice-to-have, **skill gap** («выучи X → +N вакансий») |
| Вечные вакансии | история перепубликаций по ключу компания + заголовок | **trust score компании** |
| JWT | access + refresh | **ротация refresh и детект повторного использования** (отзыв всей сессии), argon2, rate limit на auth |
| Привязка Telegram | одноразовый deep link `t.me/<bot>?start=<token>` | |
| Профиль | зарплата, формат, навыки, стоп-слова, город | загрузка резюме PDF/DOCX/TXT, навыки и грейд извлекаются из текста |
| Поиск | FTS (ru + en + simple, веса A/B/C) плюс триграммный фолбэк | |
| Фильтры | все из ТЗ; конвертация валют по курсу ЦБ | **оценка зарплаты рынка**, если зарплата не указана |
| Сортировка и пагинация | дата, зарплата, match, релевантность; курсор (keyset для даты) | |
| Канбан | Сохранено → Откликнулся → Тестовое → Интервью → Оффер / Отказ | **state machine** переходов, таймлайн событий, **авто-напоминание через 3 дня после отклика** |
| Уведомления | подписка = сохранённый поиск; бот с кнопками | режимы instant и digest, порог min_match, без повторов |
| Наблюдаемость | JSON-логи (structlog), `/health`, `/ready`, `/metrics` | **Grafana с готовым дашбордом**: собрано за час, ошибки по источникам, p95 API |
| Документация | OpenAPI / Swagger | `docs/API_CONTRACT.md`, CI (GitHub Actions) с quality gate по дедупу |

## Качество дедупликации

Демо-датасет (`backend/scripts/gen_demo.py`, seed 42) содержит размеченные межплощадочные дубли с перефразированными заголовками и текстами, а также «вечные» вакансии.

```bash
make eval   # docker compose exec api python -m scripts.eval_dedup
```

Результат на 448 публикациях (hh 226, Habr 119, Telegram 103):

| Метрика | Значение |
|---|---|
| Precision склейки (попарно) | **0.924** |
| Recall склейки | **0.943** |
| F1 | **0.933** |
| Публикаций → карточек | 448 → 243 |
| «Вечные» вакансии найдены | **15 из 15**, ложных срабатываний 0 |

Ключевое решение: разные грейды одной компании (Lead и Intern Data Analyst) всегда считаются разными вакансиями. Без этого правила precision была 0.875.

## Демо-аккаунт

После `docker compose up` зарегистрируйтесь в UI или через Swagger: `POST /api/v1/auth/register`. Затем загрузите резюме в профиле: Match Score, skill gap и сортировка «по совпадению» включатся автоматически.

## Полезное

```bash
make test      # unit-тесты
make collect   # запустить живой сбор прямо сейчас
make logs
```

LLM: положите `ANTHROPIC_API_KEY` в `.env`, и новые вакансии пойдут через Claude (`LLM_MODEL`, по умолчанию `claude-haiku-5-5`). Без ключа работает детерминированный rules-движок, интерфейс показывает метод обогащения.
