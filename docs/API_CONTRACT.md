# API Contract (source of truth for backend and frontend)

Base URL: `http://localhost:8000/api/v1`. All JSON. Auth: `Authorization: Bearer <access>`.
Endpoints marked (auth) need a token; vacancies search works anonymously (match_score = null without auth).

## Auth
- `POST /auth/register` `{email, password}` → `Tokens`
- `POST /auth/login` `{email, password}` → `Tokens`
- `POST /auth/refresh` `{refresh_token}` → `Tokens` (rotation; reused refresh → 401 and whole family revoked)
- `GET /auth/me` (auth) → `{id, email, telegram_linked: bool, created_at}`
- `POST /auth/telegram/link` (auth) → `{deep_link: "https://t.me/<bot>?start=<token>", expires_at}`

`Tokens = {access_token, refresh_token, token_type: "bearer", expires_in: 900}`

### Telegram Mini App and account lifecycle
- `POST /auth/telegram/webapp` `{init_data}` → `Tokens`. HMAC-checked Telegram initData (24h TTL); the account is created on first launch. `/auth/me` then has `email: null`, `display_name`, `telegram_username`, `photo_url`.
- `POST /auth/password/forgot` `{email}` → 202 `{ok: true}`. Always the same answer, so it doesn't reveal whether the e-mail exists; the link is valid for 1 hour.
- `POST /auth/password/reset` `{token, password(8+)}` → `Tokens`. One-time token; all other sessions are revoked.
- `POST /auth/password/change` (auth) `{current_password, new_password}` → `Tokens`. Other sessions are revoked.
- `POST /auth/logout` `{refresh_token}` → 204. `POST /auth/logout-all` (auth) → 204: every access token dies immediately (`token_version`).
- `GET /auth/me/export` (auth) → JSON attachment with all personal data. `DELETE /auth/me` (auth) `{confirm: "УДАЛИТЬ"}` → 204.
- `GET /seo/sitemap` → `{items: {id, updated_at}[]}`.

Rate limits: per client IP and per rule (path prefix + method); exceeding one returns 429 `{detail}` + `Retry-After`. `/health`, `/ready`, `/metrics` and `/docs` are exempt.

## Profile (auth)
- `GET /profile` → `Profile`
- `PUT /profile` `Profile` → `Profile`
- `POST /profile/resume` multipart `file` (pdf/docx/txt) OR json `{text}` → `{extracted_skills: string[], grade_guess: Grade|null, profile: Profile}`

`Profile = {desired_salary: int|null, currency: "RUB"|"USD"|"EUR"|"KZT", grade: Grade|null, work_formats: Format[], skills: string[], stop_words: string[], city: string|null}`

`Grade = "intern"|"junior"|"middle"|"senior"|"lead"`, `Format = "remote"|"hybrid"|"office"`

## Vacancies
- `GET /vacancies` query:
  `q, salary_min (int, in `currency`), currency (default RUB), grade (repeatable), tags (repeatable), format (repeatable), city, country, source (repeatable: hh|habr|telegram|demo), hide_ghost (bool), only_with_salary (bool), sort = date|salary|match|relevance, cursor, limit (default 20, max 100)`
  → `{items: VacancyCard[], next_cursor: string|null, total: int}`
- `GET /vacancies/{id}` → `VacancyDetail`
- `GET /vacancies/{id}/match` (auth) → `MatchExplanation`
- `GET /vacancies/{id}/similar` → `VacancyCard[]` (max 6)
- `GET /meta/filters` → `{grades: Grade[], formats: Format[], sources: {key,title,count}[], top_tags: {tag,count}[], cities: {city,count}[], currencies: string[]}`

```
VacancyCard = {
  id: int, title: string,
  company: {id, name, trust_score: 0..100, logo_url: string|null},
  salary: {from: int|null, to: int|null, currency: string, rub_from, rub_to, converted_from, converted_to, display_currency, estimated: bool, gross: bool|null},
  grade: Grade|null, format: Format|null, city: string|null, country: string|null,
  tags: string[],
  sources: {source: string, url: string, published_at: string}[],   // >1 when merged across platforms
  published_at: string, first_seen_at: string,
  water_score: 0..100,          // higher = more fluff
  red_flags: {code: string, title: string, evidence: string}[],
  is_ghost: bool, ghost_reason: string|null,   // "Подозрение на вечный поиск"
  repost_count: int,
  match_score: int|null,        // 0..100, only with auth
  summary: {what_to_do: string[], requirements: string[], conditions: string[]} | null
}
VacancyDetail = VacancyCard & {
  description_html: string, description_text: string,
  must_have: string[], nice_to_have: string[],
  enrichment: {model: string, method: "llm"|"rules", prompt_version: string, enriched_at: string},
  dedup: {cluster_size: int, merged: {source, url, reason: string, score: float}[]},
  salary_market: {p25: int, p50: int, p75: int, currency: "RUB", sample: int} | null
}
MatchExplanation = {
  score: int, breakdown: {factor: "skills"|"grade"|"salary"|"format"|"stop_words", weight: float, score: float, note: string}[],
  matched_skills: string[], missing_must: string[], missing_nice: string[]
}
```

## Tracker (auth)
Statuses: `saved → applied → test_task → interview → offer | rejected` (any → rejected allowed; backwards moves allowed except from offer/rejected back to saved).
- `GET /tracker` → `{columns: {status: TrackerItem[]}}` keys in order: saved, applied, test_task, interview, offer, rejected
- `POST /tracker` `{vacancy_id, status?: "saved"}` → `TrackerItem` (409 if exists)
- `PATCH /tracker/{item_id}` `{status?, note?, position?}` → `TrackerItem` (422 on invalid transition)
- `DELETE /tracker/{item_id}` → 204
- `GET /tracker/{item_id}/events` → `{id, kind: "status"|"note"|"reminder", payload, created_at}[]`
- `POST /tracker/{item_id}/reminders` `{remind_at, text}` → `Reminder`
- On move to `applied` the backend auto-creates reminder "Написать HR, если нет ответа" in 3 days.

`TrackerItem = {id, vacancy: VacancyCard, status, note: string|null, position: int, reminders: Reminder[], updated_at}`
`Reminder = {id, remind_at, text, sent: bool}`

## Subscriptions (auth)
- `GET /subscriptions`, `POST /subscriptions` `{name, filters: <same keys as GET /vacancies>, mode: "instant"|"digest", min_match: int|null}`, `PATCH /subscriptions/{id}`, `DELETE /subscriptions/{id}`
- `Subscription = {id, name, filters, mode, min_match, active, created_at, matched_last_24h: int}`

## Analytics (public)
- `GET /analytics/market?tag=&grade=` → `{totals: {vacancies, companies, sources, merged_duplicates, ghosts}, top_skills: {skill, count, median_salary_rub}[], salary_by_grade: {grade, p25, p50, p75, count}[], by_source: {source, count, errors_24h}[], by_format: {format, count}[], trend: {date, count}[]}`
- `GET /analytics/skill-gap` (auth) → `{current_matches: int, suggestions: {skill, unlocks: int, median_salary_rub}[]}`

## Service
- `GET /health` → `{status: "ok"}`; `GET /ready` → `{status, checks: {db, redis}}`; `GET /metrics` (Prometheus)

Errors: `{detail: string}` with proper HTTP codes.
