"use client";

import { MOCK_RATES, MOCK_VACANCIES, mockMarket, toCard } from "./mock-data";
import type {
  Format,
  Grade,
  MatchExplanation,
  MetaFilters,
  Profile,
  Subscription,
  TrackerEvent,
  TrackerItem,
  TrackerStatus,
  VacancyCard,
  VacancyDetail,
} from "./types";

export class MockHttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

type State = {
  profile: Profile;
  tracker: TrackerItem[];
  events: Record<string, TrackerEvent[]>;
  subscriptions: Subscription[];
  telegram_linked: boolean;
  seq: number;
};

const KEY = "nja.mock.state.v1";

const DEFAULT_PROFILE: Profile = {
  desired_salary: 250000,
  currency: "RUB",
  grade: "middle",
  work_formats: ["remote", "hybrid"],
  skills: ["Python", "FastAPI", "PostgreSQL", "Docker", "SQL", "Git", "Redis", "React", "TypeScript"],
  stop_words: ["1С-Битрикс", "мы — семья"],
  city: "Москва",
};

function initialState(): State {
  const now = Date.now();
  const pick = (id: number) => {
    const v = MOCK_VACANCIES.find((x) => x.id === id)!;
    return { ...toCard(v), match_score: mockMatch(v, DEFAULT_PROFILE).score };
  };
  const mk = (id: number, vid: number, status: TrackerStatus, position: number, note: string | null, hours: number): TrackerItem => ({
    id,
    vacancy: pick(vid),
    status,
    note,
    position,
    reminders:
      status === "applied"
        ? [{ id: id * 10, remind_at: new Date(now + 3 * 86400_000 - hours * 3600_000).toISOString(), text: "Написать HR, если нет ответа", sent: false }]
        : [],
    updated_at: new Date(now - hours * 3600_000).toISOString(),
  });
  const tracker = [
    mk(1, 1000, "saved", 0, null, 3),
    mk(2, 1004, "saved", 1, "Посмотреть стек команды на Habr", 20),
    mk(3, 1029, "saved", 2, null, 1),
    mk(4, 1001, "applied", 0, "Откликнулся через реферал — Лёша из команды Маркета", 30),
    mk(5, 1020, "applied", 1, null, 50),
    mk(6, 1011, "test_task", 0, "Тестовое: сервис сокращения ссылок, дедлайн пятница", 12),
    mk(7, 1018, "interview", 0, "Техсекция в четверг 15:00, повторить asyncio и индексы", 6),
    mk(8, 1016, "offer", 0, "Оффер 320k + бонус, ответить до понедельника", 4),
    mk(9, 1008, "rejected", 0, "Отказ после HR-скрининга", 100),
  ];
  const events: Record<string, TrackerEvent[]> = {};
  for (const t of tracker) {
    const base = new Date(t.updated_at).getTime();
    const evs: TrackerEvent[] = [
      { id: `${t.id}-1`, kind: "status", payload: { from: null, to: "saved" }, created_at: new Date(base - 72 * 3600_000).toISOString() },
    ];
    if (t.status !== "saved") evs.push({ id: `${t.id}-2`, kind: "status", payload: { from: "saved", to: t.status }, created_at: t.updated_at });
    if (t.note) evs.push({ id: `${t.id}-3`, kind: "note", payload: { text: t.note }, created_at: t.updated_at });
    for (const r of t.reminders) evs.push({ id: `${t.id}-r${r.id}`, kind: "reminder", payload: { text: r.text, remind_at: r.remind_at }, created_at: t.updated_at });
    events[String(t.id)] = evs.reverse();
  }
  return {
    profile: DEFAULT_PROFILE,
    tracker,
    events,
    subscriptions: [
      {
        id: 1,
        name: "Python Senior удалёнка",
        filters: { q: "python", grade: ["senior"], format: ["remote"], salary_min: 300000, currency: "RUB", hide_ghost: true },
        mode: "instant",
        min_match: 70,
        active: true,
        created_at: new Date(now - 6 * 86400_000).toISOString(),
        matched_last_24h: 7,
      },
      {
        id: 2,
        name: "Fullstack дайджест",
        filters: { tags: ["React", "TypeScript"], only_with_salary: true },
        mode: "digest",
        min_match: null,
        active: false,
        created_at: new Date(now - 2 * 86400_000).toISOString(),
        matched_last_24h: 18,
      },
    ],
    telegram_linked: false,
    seq: 100,
  };
}

let state: State | null = null;
function S(): State {
  if (state) return state;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    state = raw ? (JSON.parse(raw) as State) : initialState();
  } catch {
    state = initialState();
  }
  return state;
}
function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/* ---------------- match ---------------- */

const GRADE_RANK: Record<Grade, number> = { intern: 0, junior: 1, middle: 2, senior: 3, lead: 4 };
const lc = (s: string) => s.toLowerCase();

export function mockMatch(v: VacancyDetail, p: Profile): MatchExplanation {
  const skills = new Set(p.skills.map(lc));
  const matched = v.tags.filter((t) => skills.has(lc(t)));
  const missingMust = v.must_have.filter((t) => !skills.has(lc(t)));
  const missingNice = v.nice_to_have.filter((t) => !skills.has(lc(t)));
  const mustScore = v.must_have.length ? (v.must_have.length - missingMust.length) / v.must_have.length : 1;
  const niceScore = v.nice_to_have.length ? (v.nice_to_have.length - missingNice.length) / v.nice_to_have.length : 1;
  const skillScore = mustScore * 0.8 + niceScore * 0.2;
  const gDiff = v.grade && p.grade ? Math.abs(GRADE_RANK[v.grade] - GRADE_RANK[p.grade]) : 0;
  const gradeScore = gDiff === 0 ? 1 : gDiff === 1 ? 0.55 : 0.1;
  const top = v.salary.rub_to ?? v.salary.rub_from ?? 0;
  const want = (p.desired_salary ?? 0) * (MOCK_RATES[p.currency] ?? 1);
  const salaryScore = !want ? 1 : top >= want ? 1 : Math.max(0, top / want - 0.2);
  const formatScore = !v.format || p.work_formats.length === 0 || p.work_formats.includes(v.format) ? 1 : 0.2;
  const text = (v.description_text + " " + v.title).toLowerCase();
  const hitStop = p.stop_words.filter((w) => w && text.includes(lc(w)));
  const stopScore = hitStop.length ? 0 : 1;
  const weights = { skills: 0.5, grade: 0.15, salary: 0.15, format: 0.1, stop_words: 0.1 };
  const score = Math.round(
    100 *
      (skillScore * weights.skills +
        gradeScore * weights.grade +
        salaryScore * weights.salary +
        formatScore * weights.format +
        stopScore * weights.stop_words),
  );
  return {
    score: hitStop.length ? Math.min(score, 35) : score,
    breakdown: [
      { factor: "skills", weight: weights.skills, score: round2(skillScore), note: `Совпало ${v.must_have.length - missingMust.length} из ${v.must_have.length} обязательных навыков` },
      { factor: "grade", weight: weights.grade, score: round2(gradeScore), note: gDiff === 0 ? "Грейд совпадает" : `Разница грейдов: ${gDiff}` },
      { factor: "salary", weight: weights.salary, score: round2(salaryScore), note: want ? (top >= want ? "Вилка покрывает ожидания" : "Вилка ниже ожиданий") : "Ожидания не указаны" },
      { factor: "format", weight: weights.format, score: round2(formatScore), note: formatScore === 1 ? "Формат подходит" : "Формат не из желаемых" },
      { factor: "stop_words", weight: weights.stop_words, score: stopScore, note: hitStop.length ? `Найдены стоп-слова: ${hitStop.join(", ")}` : "Стоп-слов нет" },
    ],
    matched_skills: matched,
    missing_must: missingMust,
    missing_nice: missingNice,
  };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------- helpers ---------------- */

function withMatch(v: VacancyDetail, authed: boolean, displayCurrency: string): VacancyCard {
  const card = toCard(v);
  const out: VacancyCard = { ...card, match_score: authed ? mockMatch(v, S().profile).score : null };
  if (displayCurrency && displayCurrency !== v.salary.currency) {
    const r = MOCK_RATES[displayCurrency] ?? 1;
    out.salary = {
      ...out.salary,
      converted_from: v.salary.rub_from != null ? Math.round(v.salary.rub_from / r / 1000) * 1000 || Math.round(v.salary.rub_from / r) : null,
      converted_to: v.salary.rub_to != null ? Math.round(v.salary.rub_to / r / 1000) * 1000 || Math.round(v.salary.rub_to / r) : null,
      display_currency: displayCurrency,
    };
    if (displayCurrency !== "RUB" && out.salary.converted_from != null && out.salary.converted_from < 1000) {
      out.salary.converted_from = Math.round(v.salary.rub_from! / r / 100) * 100;
      out.salary.converted_to = v.salary.rub_to != null ? Math.round(v.salary.rub_to / r / 100) * 100 : null;
    }
  }
  return out;
}

function cardById(id: number, authed: boolean): VacancyCard {
  const v = MOCK_VACANCIES.find((x) => x.id === id);
  if (!v) throw new MockHttpError(404, "Вакансия не найдена");
  return withMatch(v, authed, "RUB");
}

function delay<T>(v: T, ms = 220 + Math.random() * 260): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), ms));
}

function allowed(from: TrackerStatus, to: TrackerStatus) {
  if (from === to) return true;
  if (to === "rejected") return true;
  if ((from === "offer" || from === "rejected") && to === "saved") return false;
  if (from === "rejected") return false;
  return true;
}

function board() {
  const cols: Record<TrackerStatus, TrackerItem[]> = { saved: [], applied: [], test_task: [], interview: [], offer: [], rejected: [] };
  for (const t of S().tracker) cols[t.status].push(t);
  for (const k of Object.keys(cols) as TrackerStatus[]) cols[k].sort((a, b) => a.position - b.position);
  return { columns: cols };
}

function pushEvent(itemId: string, ev: Omit<TrackerEvent, "id" | "created_at">) {
  const s = S();
  const list = s.events[itemId] ?? [];
  list.unshift({ ...ev, id: `${itemId}-${++s.seq}`, created_at: new Date().toISOString() });
  s.events[itemId] = list;
}

/* ---------------- router ---------------- */

export async function mockRequest(method: string, rawPath: string, body: unknown, authed: boolean): Promise<unknown> {
  const url = new URL(rawPath, "http://mock");
  const path = url.pathname.replace(/\/+$/, "");
  const q = url.searchParams;
  const s = S();
  const m = method.toUpperCase();
  const b = (body ?? {}) as Record<string, unknown>;
  const needAuth = () => {
    if (!authed) throw new MockHttpError(401, "Not authenticated");
  };

  // auth
  if (path === "/auth/login" || path === "/auth/register") {
    const email = String(b.email ?? "");
    if (!email.includes("@")) throw new MockHttpError(422, "Некорректный email");
    if (String(b.password ?? "").length < 6) throw new MockHttpError(422, "Пароль должен быть не короче 6 символов");
    try {
      localStorage.setItem("nja.mock.email", email);
    } catch {}
    return delay({ access_token: `mock.${btoa(email)}.${Date.now()}`, refresh_token: `mockr.${Date.now()}`, token_type: "bearer", expires_in: 900 });
  }
  if (path === "/auth/refresh") return delay({ access_token: `mock.${Date.now()}`, refresh_token: `mockr.${Date.now()}`, token_type: "bearer", expires_in: 900 });
  if (path === "/auth/me") {
    needAuth();
    let email = "demo@jobradar.dev";
    try {
      email = localStorage.getItem("nja.mock.email") ?? email;
    } catch {}
    return delay({ id: 1, email, telegram_linked: s.telegram_linked, created_at: new Date(Date.now() - 12 * 86400_000).toISOString() }, 80);
  }
  if (path === "/auth/telegram/link") {
    needAuth();
    s.telegram_linked = true;
    save();
    return delay({ deep_link: `https://t.me/jobradar_bot?start=${Math.random().toString(36).slice(2, 12)}`, expires_at: new Date(Date.now() + 600_000).toISOString() });
  }

  // meta
  if (path === "/meta/filters") {
    const tagCount = new Map<string, number>();
    const cityCount = new Map<string, number>();
    const srcCount = new Map<string, number>();
    for (const v of MOCK_VACANCIES) {
      v.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1));
      if (v.city) cityCount.set(v.city, (cityCount.get(v.city) ?? 0) + 1);
      v.sources.forEach((x) => srcCount.set(x.source, (srcCount.get(x.source) ?? 0) + 1));
    }
    const res: MetaFilters = {
      grades: ["intern", "junior", "middle", "senior", "lead"],
      formats: ["remote", "hybrid", "office"],
      sources: [
        { key: "hh", title: "hh.ru", count: srcCount.get("hh") ?? 0 },
        { key: "habr", title: "Habr Карьера", count: srcCount.get("habr") ?? 0 },
        { key: "telegram", title: "Telegram", count: srcCount.get("telegram") ?? 0 },
      ],
      top_tags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([tag, count]) => ({ tag, count })),
      cities: [...cityCount.entries()].sort((a, b) => b[1] - a[1]).map(([city, count]) => ({ city, count })),
      currencies: ["RUB", "USD", "EUR", "KZT"],
    };
    return delay(res, 120);
  }

  // vacancies
  if (path === "/vacancies" && m === "GET") {
    const text = (q.get("q") ?? "").trim().toLowerCase();
    const currency = q.get("currency") ?? "RUB";
    const salaryMin = Number(q.get("salary_min") ?? 0) * (MOCK_RATES[currency] ?? 1);
    const grades = q.getAll("grade");
    const tags = q.getAll("tags").map(lc);
    const formats = q.getAll("format");
    const sources = q.getAll("source");
    const city = q.get("city");
    const hideGhost = q.get("hide_ghost") === "true";
    const onlySalary = q.get("only_with_salary") === "true";
    const sort = q.get("sort") ?? "date";
    const list = MOCK_VACANCIES.filter((v) => {
      if (text) {
        const hay = `${v.title} ${v.company.name} ${v.tags.join(" ")} ${v.description_text}`.toLowerCase();
        if (!text.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      if (salaryMin && (v.salary.estimated || (v.salary.rub_to ?? v.salary.rub_from ?? 0) < salaryMin)) return false;
      if (grades.length && (!v.grade || !grades.includes(v.grade))) return false;
      if (tags.length && !tags.every((t) => v.tags.map(lc).includes(t))) return false;
      if (formats.length && (!v.format || !formats.includes(v.format as Format))) return false;
      if (sources.length && !v.sources.some((x) => sources.includes(x.source))) return false;
      if (city && v.city !== city) return false;
      if (hideGhost && v.is_ghost) return false;
      if (onlySalary && v.salary.estimated) return false;
      return true;
    }).map((v) => withMatch(v, authed, currency));
    if (sort === "salary") list.sort((a, b) => (b.salary.rub_to ?? b.salary.rub_from ?? 0) - (a.salary.rub_to ?? a.salary.rub_from ?? 0));
    else if (sort === "match") list.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
    else if (sort === "relevance") list.sort((a, b) => b.sources.length - a.sources.length || a.water_score - b.water_score);
    else list.sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at));
    const limit = Math.min(Number(q.get("limit") ?? 20), 100);
    const offset = Number(q.get("cursor") ?? 0) || 0;
    const items = list.slice(offset, offset + limit);
    const next = offset + limit < list.length ? String(offset + limit) : null;
    return delay({ items, next_cursor: next, total: list.length });
  }
  const vm = path.match(/^\/vacancies\/(\d+)(\/(match|similar))?$/);
  if (vm) {
    const id = Number(vm[1]);
    const v = MOCK_VACANCIES.find((x) => x.id === id) ?? MOCK_VACANCIES[id % MOCK_VACANCIES.length];
    if (vm[3] === "match") {
      needAuth();
      return delay(mockMatch(v, s.profile));
    }
    if (vm[3] === "similar") {
      const tagset = new Set(v.tags.map(lc));
      return delay(
        MOCK_VACANCIES.filter((x) => x.id !== v.id)
          .map((x) => ({ x, sim: x.tags.filter((t) => tagset.has(lc(t))).length + (x.grade === v.grade ? 1 : 0) }))
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 6)
          .map(({ x }) => withMatch(x, authed, "RUB")),
      );
    }
    const detail: VacancyDetail = { ...v, match_score: authed ? mockMatch(v, s.profile).score : null };
    return delay(detail);
  }

  // profile
  if (path === "/profile") {
    needAuth();
    if (m === "PUT") {
      s.profile = { ...s.profile, ...(b as Partial<Profile>) };
      save();
    }
    return delay(s.profile);
  }
  if (path === "/profile/resume") {
    needAuth();
    const text = typeof b.text === "string" ? b.text : "";
    const dict = ["Python", "FastAPI", "Django", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Kafka", "React", "TypeScript", "Go", "SQL", "Git", "Celery", "asyncio", "Linux", "Airflow", "Spark", "Terraform", "Next.js", "Node.js", "pytest", "ClickHouse", "gRPC"];
    let skills = text ? dict.filter((d) => text.toLowerCase().includes(d.toLowerCase())) : [];
    if (skills.length < 3) skills = ["Python", "FastAPI", "PostgreSQL", "Docker", "Redis", "asyncio", "SQL", "Git", "Celery", "Linux"];
    const grade: Grade = /senior|сеньор|5\+|6 лет|7 лет/i.test(text) ? "senior" : /junior|джун/i.test(text) ? "junior" : "middle";
    s.profile = { ...s.profile, skills: Array.from(new Set([...s.profile.skills, ...skills])), grade };
    save();
    return delay({ extracted_skills: skills, grade_guess: grade, profile: s.profile }, 1300);
  }

  // tracker
  if (path === "/tracker" && m === "GET") {
    needAuth();
    return delay(board());
  }
  if (path === "/tracker" && m === "POST") {
    needAuth();
    const vid = Number(b.vacancy_id);
    if (s.tracker.some((t) => t.vacancy.id === vid)) throw new MockHttpError(409, "Вакансия уже в трекере");
    const status = (b.status as TrackerStatus) ?? "saved";
    const item: TrackerItem = {
      id: ++s.seq,
      vacancy: cardById(vid, true),
      status,
      note: null,
      position: s.tracker.filter((t) => t.status === status).length,
      reminders: [],
      updated_at: new Date().toISOString(),
    };
    s.tracker.push(item);
    pushEvent(String(item.id), { kind: "status", payload: { from: null, to: status } });
    save();
    return delay(item);
  }
  const tm = path.match(/^\/tracker\/([^/]+)(\/(events|reminders))?$/);
  if (tm) {
    needAuth();
    const item = s.tracker.find((t) => String(t.id) === tm[1]);
    if (!item) throw new MockHttpError(404, "Карточка не найдена");
    const key = String(item.id);
    if (tm[3] === "events") return delay(s.events[key] ?? [], 150);
    if (tm[3] === "reminders") {
      const r = { id: ++s.seq, remind_at: String(b.remind_at), text: String(b.text ?? "Напоминание"), sent: false };
      item.reminders.push(r);
      pushEvent(key, { kind: "reminder", payload: { text: r.text, remind_at: r.remind_at } });
      save();
      return delay(r);
    }
    if (m === "DELETE") {
      s.tracker = s.tracker.filter((t) => t !== item);
      save();
      return delay(null);
    }
    if (m === "PATCH") {
      if (b.status && b.status !== item.status) {
        const to = b.status as TrackerStatus;
        if (!allowed(item.status, to)) throw new MockHttpError(422, `Нельзя перейти из «${item.status}» в «${to}»`);
        pushEvent(key, { kind: "status", payload: { from: item.status, to } });
        if (to === "applied") {
          const r = { id: ++s.seq, remind_at: new Date(Date.now() + 3 * 86400_000).toISOString(), text: "Написать HR, если нет ответа", sent: false };
          item.reminders.push(r);
          pushEvent(key, { kind: "reminder", payload: { text: r.text, remind_at: r.remind_at, auto: true } });
        }
        item.status = to;
      }
      if (typeof b.note === "string" && b.note !== item.note) {
        item.note = b.note;
        pushEvent(key, { kind: "note", payload: { text: b.note } });
      }
      if (typeof b.position === "number") item.position = b.position;
      item.updated_at = new Date().toISOString();
      save();
      return delay(item, 150);
    }
  }

  // subscriptions
  if (path === "/subscriptions") {
    needAuth();
    if (m === "POST") {
      const sub: Subscription = {
        id: ++s.seq,
        name: String(b.name ?? "Подписка"),
        filters: (b.filters as Subscription["filters"]) ?? {},
        mode: (b.mode as Subscription["mode"]) ?? "instant",
        min_match: (b.min_match as number | null) ?? null,
        active: true,
        created_at: new Date().toISOString(),
        matched_last_24h: Math.floor(Math.random() * 12) + 1,
      };
      s.subscriptions.unshift(sub);
      save();
      return delay(sub);
    }
    return delay(s.subscriptions);
  }
  const sm = path.match(/^\/subscriptions\/([^/]+)$/);
  if (sm) {
    needAuth();
    const sub = s.subscriptions.find((x) => String(x.id) === sm[1]);
    if (!sub) throw new MockHttpError(404, "Подписка не найдена");
    if (m === "DELETE") {
      s.subscriptions = s.subscriptions.filter((x) => x !== sub);
      save();
      return delay(null);
    }
    Object.assign(sub, b);
    save();
    return delay(sub);
  }

  // analytics
  if (path === "/analytics/market") return delay(mockMarket(), 300);
  if (path === "/analytics/skill-gap") {
    needAuth();
    const have = new Set(s.profile.skills.map(lc));
    const counts = new Map<string, number>();
    for (const v of MOCK_VACANCIES) for (const t of v.must_have) if (!have.has(lc(t))) counts.set(t, (counts.get(t) ?? 0) + 1);
    const suggestions = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([skill, n], k) => ({ skill, unlocks: n * 23 + 11 - k * 2, median_salary_rub: 260000 + ((skill.length * 17000) % 160000) }));
    return delay({ current_matches: 412, suggestions }, 300);
  }

  if (path === "/health") return delay({ status: "ok" });
  throw new MockHttpError(404, "Not Found");
}

export function resetMockState() {
  state = initialState();
  save();
}
