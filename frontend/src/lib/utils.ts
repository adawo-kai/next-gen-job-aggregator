import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Format, Grade, Salary, TrackerStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const GRADE_LABEL: Record<Grade, string> = {
  intern: "Intern",
  junior: "Junior",
  middle: "Middle",
  senior: "Senior",
  lead: "Lead",
};

export const FORMAT_LABEL: Record<Format, string> = {
  remote: "Удалёнка",
  hybrid: "Гибрид",
  office: "Офис",
};

type SourceStyle = { title: string; short: string; className: string; dot: string; color: string };

export const SOURCE_META: Record<string, SourceStyle> = {
  hh: { title: "hh.ru", short: "hh", className: "text-rose-500 dark:text-rose-300 bg-rose-500/10 ring-rose-500/25", dot: "bg-rose-400", color: "#fb7185" },
  habr: { title: "Habr Карьера", short: "Habr", className: "text-sky-600 dark:text-sky-300 bg-sky-500/10 ring-sky-500/25", dot: "bg-sky-400", color: "#38bdf8" },
  telegram: { title: "Telegram", short: "Telegram", className: "text-cyan-600 dark:text-cyan-300 bg-cyan-500/10 ring-cyan-500/25", dot: "bg-cyan-400", color: "#22d3ee" },
  devkg: { title: "DevKG", short: "DevKG", className: "text-teal-600 dark:text-teal-300 bg-teal-500/10 ring-teal-500/25", dot: "bg-teal-400", color: "#2dd4bf" },
  geekjob: { title: "GeekJob", short: "GeekJob", className: "text-amber-600 dark:text-amber-300 bg-amber-500/10 ring-amber-500/25", dot: "bg-amber-400", color: "#fbbf24" },
  demo: { title: "Demo", short: "Demo", className: "text-zinc-500 dark:text-zinc-300 bg-zinc-500/10 ring-zinc-500/25", dot: "bg-zinc-400", color: "#a1a1aa" },
};

export function sourceMeta(key: string): SourceStyle {
  return (
    SOURCE_META[key] ?? {
      title: key,
      short: key,
      className: "text-zinc-500 dark:text-zinc-300 bg-zinc-500/10 ring-zinc-500/25",
      dot: "bg-zinc-400",
      color: "#a1a1aa",
    }
  );
}

export const STATUS_META: Record<TrackerStatus, { title: string; dot: string; color: string }> = {
  saved: { title: "Сохранено", dot: "bg-zinc-400", color: "#a1a1aa" },
  applied: { title: "Откликнулся", dot: "bg-sky-400", color: "#38bdf8" },
  test_task: { title: "Тестовое", dot: "bg-amber-400", color: "#fbbf24" },
  interview: { title: "Интервью", dot: "bg-violet-400", color: "#a78bfa" },
  offer: { title: "Оффер", dot: "bg-emerald-400", color: "#34d399" },
  rejected: { title: "Отказ", dot: "bg-rose-400", color: "#fb7185" },
};

export const STATUS_ORDER: TrackerStatus[] = ["saved", "applied", "test_task", "interview", "offer", "rejected"];

const CURRENCY_SIGN: Record<string, string> = { RUB: "₽", USD: "$", EUR: "€", KZT: "₸", KGS: "сом" };
export const currencySign = (c: string) => CURRENCY_SIGN[c] ?? c;

function num(n: number, compact: boolean) {
  if (compact && n >= 1000) {
    const k = n / 1000;
    return `${(k >= 100 ? Math.round(k) : Math.round(k * 10) / 10).toLocaleString("ru-RU")}k`;
  }
  return Math.round(n).toLocaleString("ru-RU");
}

export function formatMoney(n: number, currency = "RUB", compact = false) {
  return `${num(n, compact)} ${currencySign(currency)}`;
}

export function formatSalary(s: Salary, compact = false): string | null {
  const usingConverted = s.converted_from != null || s.converted_to != null;
  const from = usingConverted ? s.converted_from : s.from;
  const to = usingConverted ? s.converted_to : s.to;
  const c = usingConverted ? s.display_currency || s.currency : s.currency;
  if (from == null && to == null) return null;
  const sign = currencySign(c);
  if (from != null && to != null && from !== to) return `${num(from, compact)} – ${num(to, compact)} ${sign}`;
  if (from != null) return `от ${num(from, compact)} ${sign}`;
  return `до ${num(to as number, compact)} ${sign}`;
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Date.now() - d;
  const m = Math.round(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  const mo = Math.round(days / 30);
  return `${mo} мес назад`;
}

export function formatDate(iso: string, withTime = false) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function scoreTone(score: number) {
  if (score >= 75) return { text: "text-emerald-500 dark:text-emerald-400", stroke: "#34d399", bg: "bg-emerald-400" };
  if (score >= 50) return { text: "text-amber-500 dark:text-amber-300", stroke: "#fbbf24", bg: "bg-amber-400" };
  return { text: "text-rose-500 dark:text-rose-400", stroke: "#fb7185", bg: "bg-rose-400" };
}

export function trustTone(score: number) {
  if (score >= 70) return "text-emerald-500 dark:text-emerald-400";
  if (score >= 45) return "text-amber-500 dark:text-amber-300";
  return "text-rose-500 dark:text-rose-400";
}

export function initials(name: string) {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
