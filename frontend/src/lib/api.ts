"use client";

import { MockHttpError, mockRequest } from "./mock-api";
import type {
  MarketAnalytics,
  MatchExplanation,
  Me,
  MetaFilters,
  Profile,
  Reminder,
  ResumeResult,
  SkillGap,
  Subscription,
  Tokens,
  TrackerBoard,
  TrackerEvent,
  TrackerItem,
  TrackerStatus,
  VacancyCard,
  VacancyDetail,
  VacancyFilters,
  VacancyPage,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "");
const FORCE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

/* ---------------- token storage ---------------- */

const ACCESS = "nja.access";
const REFRESH = "nja.refresh";
type Listener = () => void;
const authListeners = new Set<Listener>();

export const tokens = {
  get access() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACCESS);
  },
  get refresh() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH);
  },
  set(t: Tokens) {
    localStorage.setItem(ACCESS, t.access_token);
    localStorage.setItem(REFRESH, t.refresh_token);
    authListeners.forEach((l) => l());
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
    authListeners.forEach((l) => l());
  },
  subscribe(l: Listener) {
    authListeners.add(l);
    return () => authListeners.delete(l);
  },
};

/* ---------------- mock-mode store ---------------- */

let mockActive = FORCE_MOCK;
let mockSince = 0;
const mockListeners = new Set<Listener>();
const RETRY_BACKEND_MS = 20_000;

export const mockMode = {
  get active() {
    return mockActive;
  },
  subscribe(l: Listener) {
    mockListeners.add(l);
    return () => mockListeners.delete(l);
  },
};

function setMock(v: boolean) {
  if (FORCE_MOCK) v = true;
  if (v) mockSince = Date.now();
  if (v !== mockActive) {
    mockActive = v;
    mockListeners.forEach((l) => l());
  }
}

function shouldSkipNetwork() {
  return FORCE_MOCK || (mockActive && Date.now() - mockSince < RETRY_BACKEND_MS);
}

/* ---------------- core request ---------------- */

type Opts = { method?: string; body?: unknown; auth?: boolean; form?: FormData };

async function viaMock<T>(path: string, o: Opts): Promise<T> {
  setMock(true);
  try {
    return (await mockRequest(o.method ?? "GET", path, o.body, !!tokens.access)) as T;
  } catch (e) {
    if (e instanceof MockHttpError) throw new ApiError(e.status, e.detail);
    throw e;
  }
}

let refreshing: Promise<boolean> | null = null;
async function refreshTokens(): Promise<boolean> {
  const rt = tokens.refresh;
  if (!rt) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (!res.ok) return false;
        tokens.set((await res.json()) as Tokens);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

async function rawFetch(path: string, o: Opts): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (o.body !== undefined && !o.form) headers["Content-Type"] = "application/json";
  const at = tokens.access;
  if (at) headers.Authorization = `Bearer ${at}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetch(`${API_URL}${path}`, {
      method: o.method ?? "GET",
      headers,
      body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = res.statusText || `HTTP ${res.status}`;
  try {
    const j = await res.json();
    if (typeof j?.detail === "string") detail = j.detail;
    else if (Array.isArray(j?.detail)) detail = j.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || detail;
  } catch {}
  return new ApiError(res.status, detail);
}

const isMockToken = (t: string | null) => !!t && t.startsWith("mock");

export async function request<T>(path: string, o: Opts = {}): Promise<T> {
  if (shouldSkipNetwork() || isMockToken(tokens.access)) return viaMock<T>(path, o);

  let res: Response;
  try {
    res = await rawFetch(path, o);
  } catch {
    // network error / CORS / timeout -> demo mode
    return viaMock<T>(path, o);
  }
  if (res.status === 401 && tokens.refresh && !path.startsWith("/auth/")) {
    const ok = await refreshTokens();
    if (ok) {
      try {
        res = await rawFetch(path, o);
      } catch {
        return viaMock<T>(path, o);
      }
    } else {
      tokens.clear();
    }
  }
  if ([502, 503, 504].includes(res.status)) return viaMock<T>(path, o);
  if (res.status === 404 || res.status === 405) {
    // Route not implemented yet on the backend (FastAPI default body) -> fallback
    const clone = res.clone();
    try {
      const j = await clone.json();
      if (j?.detail === "Not Found" || j?.detail === "Method Not Allowed") return viaMock<T>(path, o);
    } catch {}
  }
  if (!res.ok) throw await parseError(res);
  setMock(false);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* ---------------- query helpers ---------------- */

export function filtersToQuery(f: VacancyFilters, extra: Record<string, string | number | undefined | null> = {}) {
  const p = new URLSearchParams();
  const add = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === "" || v === false) return;
    p.append(k, String(v));
  };
  add("q", f.q?.trim());
  add("salary_min", f.salary_min);
  add("currency", f.currency);
  f.grade?.forEach((g) => add("grade", g));
  f.tags?.forEach((t) => add("tags", t));
  f.format?.forEach((t) => add("format", t));
  f.source?.forEach((t) => add("source", t));
  add("city", f.city);
  add("country", f.country);
  if (f.hide_ghost) add("hide_ghost", "true");
  if (f.only_with_salary) add("only_with_salary", "true");
  add("sort", f.sort);
  for (const [k, v] of Object.entries(extra)) add(k, v);
  return p.toString();
}

/* ---------------- typed endpoints ---------------- */

export const api = {
  login: (email: string, password: string) => request<Tokens>("/auth/login", { method: "POST", body: { email, password } }),
  register: (email: string, password: string) => request<Tokens>("/auth/register", { method: "POST", body: { email, password } }),
  me: () => request<Me>("/auth/me"),
  telegramLink: () => request<{ deep_link: string; expires_at: string }>("/auth/telegram/link", { method: "POST", body: {} }),

  profile: () => request<Profile>("/profile"),
  saveProfile: (p: Profile) => request<Profile>("/profile", { method: "PUT", body: p }),
  uploadResumeText: (text: string) => request<ResumeResult>("/profile/resume", { method: "POST", body: { text } }),
  uploadResumeFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ResumeResult>("/profile/resume", { method: "POST", form, body: {} });
  },

  vacancies: (f: VacancyFilters, cursor?: string | null, limit = 20) =>
    request<VacancyPage>(`/vacancies?${filtersToQuery(f, { cursor: cursor ?? undefined, limit })}`),
  vacancy: (id: number | string) => request<VacancyDetail>(`/vacancies/${id}`),
  match: (id: number | string) => request<MatchExplanation>(`/vacancies/${id}/match`),
  similar: (id: number | string) => request<VacancyCard[]>(`/vacancies/${id}/similar`),
  meta: () => request<MetaFilters>("/meta/filters"),

  tracker: () => request<TrackerBoard>("/tracker"),
  addToTracker: (vacancy_id: number, status: TrackerStatus = "saved") =>
    request<TrackerItem>("/tracker", { method: "POST", body: { vacancy_id, status } }),
  patchTracker: (id: number | string, body: { status?: TrackerStatus; note?: string; position?: number }) =>
    request<TrackerItem>(`/tracker/${id}`, { method: "PATCH", body }),
  deleteTracker: (id: number | string) => request<void>(`/tracker/${id}`, { method: "DELETE" }),
  trackerEvents: (id: number | string) => request<TrackerEvent[]>(`/tracker/${id}/events`),
  addReminder: (id: number | string, remind_at: string, text: string) =>
    request<Reminder>(`/tracker/${id}/reminders`, { method: "POST", body: { remind_at, text } }),

  subscriptions: () => request<Subscription[]>("/subscriptions"),
  createSubscription: (s: Pick<Subscription, "name" | "filters" | "mode" | "min_match">) =>
    request<Subscription>("/subscriptions", { method: "POST", body: s }),
  patchSubscription: (id: number | string, s: Partial<Subscription>) =>
    request<Subscription>(`/subscriptions/${id}`, { method: "PATCH", body: s }),
  deleteSubscription: (id: number | string) => request<void>(`/subscriptions/${id}`, { method: "DELETE" }),

  market: (params: { tag?: string; grade?: string } = {}) => {
    const p = new URLSearchParams();
    if (params.tag) p.set("tag", params.tag);
    if (params.grade) p.set("grade", params.grade);
    const qs = p.toString();
    return request<MarketAnalytics>(`/analytics/market${qs ? `?${qs}` : ""}`);
  },
  skillGap: () => request<SkillGap>("/analytics/skill-gap"),
};
