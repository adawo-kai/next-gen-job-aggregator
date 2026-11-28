export type Grade = "intern" | "junior" | "middle" | "senior" | "lead";
export type Format = "remote" | "hybrid" | "office";
export type Currency = "RUB" | "USD" | "EUR" | "KZT" | "KGS";
export type SourceKey = string;
export type SortKey = "date" | "salary" | "match" | "relevance";

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
}

export interface Me {
  id: number | string;
  /** null for accounts created from the Telegram Mini App */
  email: string | null;
  telegram_linked: boolean;
  created_at: string;
  display_name?: string | null;
  telegram_username?: string | null;
  photo_url?: string | null;
}

export interface Profile {
  desired_salary: number | null;
  currency: Currency;
  grade: Grade | null;
  work_formats: Format[];
  skills: string[];
  stop_words: string[];
  city: string | null;
}

export interface ResumeResult {
  extracted_skills: string[];
  grade_guess: Grade | null;
  profile: Profile;
}

export interface Company {
  id: number | string;
  name: string;
  trust_score: number | null; // null when the employer is unknown
  logo_url: string | null;
}

export interface Salary {
  from: number | null;
  to: number | null;
  currency: string;
  rub_from: number | null;
  rub_to: number | null;
  converted_from: number | null;
  converted_to: number | null;
  display_currency: string;
  estimated: boolean;
  gross: boolean | null;
}

export interface VacancySource {
  source: SourceKey;
  url: string;
  published_at: string;
}

export interface RedFlag {
  code: string;
  title: string;
  evidence: string;
}

export interface Summary {
  what_to_do: string[];
  requirements: string[];
  conditions: string[];
}

export interface VacancyCard {
  id: number;
  title: string;
  company: Company;
  salary: Salary;
  grade: Grade | null;
  format: Format | null;
  city: string | null;
  country: string | null;
  tags: string[];
  sources: VacancySource[];
  published_at: string;
  first_seen_at: string;
  water_score: number;
  red_flags: RedFlag[];
  is_ghost: boolean;
  ghost_reason: string | null;
  repost_count: number;
  match_score: number | null;
  summary: Summary | null;
}

export interface VacancyDetail extends VacancyCard {
  description_html: string;
  description_text: string;
  must_have: string[];
  nice_to_have: string[];
  enrichment: { model: string; method: "llm" | "rules"; prompt_version: string; enriched_at: string };
  dedup: { cluster_size: number; merged: { source: SourceKey; url: string; reason: string; score: number }[] };
  salary_market: { p25: number; p50: number; p75: number; currency: "RUB"; sample: number } | null;
}

export type MatchFactor = "skills" | "grade" | "salary" | "format" | "stop_words";

export interface MatchExplanation {
  score: number;
  breakdown: { factor: MatchFactor; weight: number; score: number; note: string }[];
  matched_skills: string[];
  missing_must: string[];
  missing_nice: string[];
}

export interface VacancyPage {
  items: VacancyCard[];
  next_cursor: string | null;
  total: number;
}

export interface MetaFilters {
  grades: Grade[];
  formats: Format[];
  sources: { key: SourceKey; title: string; count: number }[];
  top_tags: { tag: string; count: number }[];
  cities: { city: string; count: number }[];
  currencies: string[];
}

export interface VacancyFilters {
  q?: string;
  salary_min?: number;
  currency?: Currency;
  grade?: Grade[];
  tags?: string[];
  format?: Format[];
  city?: string;
  country?: string;
  source?: SourceKey[];
  hide_ghost?: boolean;
  only_with_salary?: boolean;
  sort?: SortKey;
}

export type TrackerStatus = "saved" | "applied" | "test_task" | "interview" | "offer" | "rejected";

export interface Reminder {
  id: number | string;
  remind_at: string;
  text: string;
  sent: boolean;
}

export interface TrackerItem {
  id: number | string;
  vacancy: VacancyCard;
  status: TrackerStatus;
  note: string | null;
  position: number;
  reminders: Reminder[];
  updated_at: string;
}

export interface TrackerBoard {
  columns: Record<TrackerStatus, TrackerItem[]>;
  /** allowed next statuses per status (state machine on the backend) */
  transitions?: Record<TrackerStatus, TrackerStatus[]>;
}

export interface TrackerEvent {
  id: number | string;
  kind: "status" | "note" | "reminder";
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Subscription {
  id: number | string;
  name: string;
  filters: VacancyFilters;
  mode: "instant" | "digest";
  min_match: number | null;
  active: boolean;
  created_at: string;
  matched_last_24h: number;
}

export interface MarketAnalytics {
  totals: { vacancies: number; companies: number; sources: number; merged_duplicates: number; ghosts: number };
  top_skills: { skill: string; count: number; median_salary_rub: number | null }[];
  salary_by_grade: { grade: Grade; p25: number; p50: number; p75: number; count: number }[];
  by_source: { source: SourceKey; count: number; errors_24h: number }[];
  by_format: { format: Format; count: number }[];
  trend: { date: string; count: number }[];
}

export interface SkillGap {
  current_matches: number;
  suggestions: { skill: string; unlocks: number; median_salary_rub: number | null }[];
}
