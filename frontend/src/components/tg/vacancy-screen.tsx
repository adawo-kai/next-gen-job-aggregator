"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  EyeOff,
  ExternalLink,
  Ghost,
  Gift,
  Layers,
  MoreHorizontal,
  Send,
  ShieldCheck,
  Sparkles,
  UserRoundPen,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { MatchExplanation, TrackerBoard, TrackerItem, VacancyCard as Card, VacancyDetail } from "@/lib/types";
import { cn, formatDate, formatMoney, plural, scoreTone, sourceMeta, timeAgo, trustTone } from "@/lib/utils";
import { BOT_USERNAME, cardFromCache, findTrackedItem, K, profileHasSignal, useProfile, useTracker } from "./data";
import { MainButton } from "./main-button";
import { useGoBack, usePushScreen } from "./nav";
import { sanitizeHtml, textToHtml } from "./sanitize";
import { confirmDialog, haptic, isRealTelegram, openLink, openTelegramLink, useBackButton } from "./telegram";
import { Avatar, Bar, Button, Collapse, EmptyState, MatchRing, Pill, Section, Separator, Sheet, Skeleton } from "./ui";
import { metaLine, SalaryLine, uniqueSources } from "./vacancy-card";

const FACTOR_LABEL: Record<string, string> = {
  skills: "Навыки",
  grade: "Грейд",
  salary: "Зарплата",
  format: "Формат работы",
  stop_words: "Стоп-слова",
};

function joinRu(list: string[]) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} и ${list[list.length - 1]}`;
}

/* ---------------- header ---------------- */

function Header({ v, onMenu }: { v: Card; onMenu?: () => void }) {
  const sources = uniqueSources(v);
  const meta = metaLine(v);
  return (
    <div className="rounded-[14px] bg-card p-4">
      <div className="flex items-start gap-3">
        <Avatar src={v.company.logo_url} name={v.company.name} size={52} rounded="xl" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[15px]">
            <span className="truncate font-medium">{v.company.name}</span>
            <span className={cn("inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium tabular-nums", trustTone(v.company.trust_score))}>
              <ShieldCheck className="h-3.5 w-3.5" />
              {v.company.trust_score}
            </span>
          </div>
          <div className="text-[13px] text-muted-foreground">
            {timeAgo(v.published_at)}
            {v.repost_count > 0 ? ` · перепубликаций: ${v.repost_count}` : ""}
          </div>
        </div>
        {onMenu && (
          <button type="button" aria-label="Ещё" onClick={onMenu} className="tg-press -mr-2 -mt-2 grid h-11 w-11 place-items-center rounded-full text-muted-foreground">
            <MoreHorizontal className="h-[22px] w-[22px]" />
          </button>
        )}
      </div>
      <h1 className="mt-3 text-balance text-[21px] font-bold leading-[1.22] tracking-[-0.02em]">{v.title}</h1>
      <SalaryLine salary={v.salary} className="mt-2 [&>span:first-child]:text-[18px]" />
      {meta && <div className="mt-1 text-[15px] text-muted-foreground">{meta}</div>}
      {(sources.length > 1 || v.is_ghost || v.red_flags.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sources.length > 1 && (
            <Pill tone="accent">
              <Layers className="h-3 w-3" />
              {sources.length} {plural(sources.length, "площадка", "площадки", "площадок")}
            </Pill>
          )}
          {v.is_ghost && (
            <Pill>
              <Ghost className="h-3 w-3" />
              Вечный поиск?
            </Pill>
          )}
          {v.red_flags.length > 0 && (
            <Pill tone="danger">
              <AlertTriangle className="h-3 w-3" />
              {v.red_flags.length} {plural(v.red_flags.length, "red flag", "red flags", "red flags")}
            </Pill>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- match ---------------- */

function MatchSection({ match, loading, v }: { match?: MatchExplanation; loading: boolean; v: VacancyDetail }) {
  if (loading || !match)
    return (
      <Section title="Совпадение с профилем">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </Section>
    );
  const verdict = match.score >= 75 ? "Отличное совпадение — стоит откликнуться" : match.score >= 50 ? "Хорошее совпадение, есть пробелы" : "Слабое совпадение";
  const total = v.must_have.length + v.nice_to_have.length;
  return (
    <Section title="Совпадение с профилем">
      <div className="flex items-center gap-3.5 p-4 pb-3">
        <MatchRing score={match.score} size={64} stroke={5} />
        <div className="min-w-0">
          <div className="text-[16px] font-semibold leading-snug">{verdict}</div>
          {total > 0 && (
            <div className="mt-0.5 text-[14px] text-muted-foreground">
              Совпало навыков: {match.matched_skills.length} из {total}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-3 px-4 pb-4">
        {match.breakdown.map((b, i) => {
          const t = scoreTone(b.score * 100);
          return (
            <div key={b.factor}>
              <div className="flex items-baseline justify-between gap-2 text-[14px]">
                <span className="font-medium">{FACTOR_LABEL[b.factor] ?? b.factor}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className={cn("font-semibold", t.text)}>+{Math.round(b.weight * b.score * 100)}</span> / {Math.round(b.weight * 100)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <Bar className={t.bg} value={Math.max(2, b.score * 100)} delayMs={60 * i} />
              </div>
              {b.note && <div className="mt-1 text-[13px] leading-snug text-muted-foreground">{b.note}</div>}
            </div>
          );
        })}
        {(match.missing_must.length > 0 || match.missing_nice.length > 0) && (
          <div className="rounded-xl bg-rose-500/[0.08] p-3 text-[14px] leading-snug">
            <span className="font-semibold text-rose-600 dark:text-rose-300">Не хватает: </span>
            {match.missing_must.join(", ")}
            {match.missing_nice.length > 0 && (
              <span className="text-muted-foreground">
                {match.missing_must.length ? "; " : ""}
                желательно: {match.missing_nice.join(", ")}
              </span>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

function ProfilePrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <Section title="Совпадение с профилем">
      <button type="button" onClick={onOpen} className="tg-press flex w-full items-center gap-3 p-4 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--tg-button)_14%,transparent)] text-[var(--tg-link)]">
          <UserRoundPen className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Заполните профиль</span>
          <span className="block text-[14px] text-muted-foreground">Покажем, насколько вакансия вам подходит и каких навыков не хватает</span>
        </span>
      </button>
    </Section>
  );
}

/* ---------------- summary / skills ---------------- */

function SummarySection({ v }: { v: VacancyDetail }) {
  if (!v.summary) return null;
  const blocks = [
    { title: "Что делать", icon: Wrench, items: v.summary.what_to_do, tone: "text-violet-600 dark:text-violet-300 bg-violet-500/12" },
    { title: "Что требуют", icon: ClipboardList, items: v.summary.requirements, tone: "text-sky-600 dark:text-sky-300 bg-sky-500/12" },
    { title: "Условия", icon: Gift, items: v.summary.conditions, tone: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/12" },
  ].filter((b) => b.items.length > 0);
  if (!blocks.length) return null;
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Коротко о главном
        </span>
      }
      footer={v.enrichment.method === "llm" ? "Саммари составлено AI по тексту вакансии" : "Саммари составлено автоматически по тексту вакансии"}
    >
      {blocks.map((b, i) => (
        <div key={b.title}>
          {i > 0 && <Separator />}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
              <span className={cn("grid h-7 w-7 place-items-center rounded-lg", b.tone)}>
                <b.icon className="h-4 w-4" />
              </span>
              {b.title}
            </div>
            <ul className="space-y-1.5">
              {b.items.map((it) => (
                <li key={it} className="flex gap-2.5 text-[15px] leading-snug">
                  <span className="mt-[8px] h-[5px] w-[5px] shrink-0 rounded-full bg-muted-foreground/70" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </Section>
  );
}

function SkillsSection({ v, match }: { v: VacancyDetail; match?: MatchExplanation }) {
  if (!v.must_have.length && !v.nice_to_have.length) return null;
  const matched = new Set((match?.matched_skills ?? []).map((s) => s.toLowerCase()));
  const pill = (s: string, must: boolean) => {
    const st = !match ? "neutral" : matched.has(s.toLowerCase()) ? "ok" : "miss";
    return (
      <span
        key={s}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[14px] font-medium",
          st === "ok" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
          st === "miss" && (must ? "bg-rose-500/12 text-rose-700 dark:text-rose-300" : "bg-amber-500/14 text-amber-700 dark:text-amber-300"),
          st === "neutral" && "bg-muted text-foreground",
        )}
      >
        {st === "ok" && <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}
        {st === "miss" && <X className="h-3.5 w-3.5" strokeWidth={2.6} />}
        {s}
      </span>
    );
  };
  return (
    <Section title="Навыки">
      <div className="space-y-3.5 p-4">
        {v.must_have.length > 0 && (
          <div>
            <div className="mb-2 text-[13px] font-medium text-muted-foreground">Обязательно</div>
            <div className="flex flex-wrap gap-1.5">{v.must_have.map((s) => pill(s, true))}</div>
          </div>
        )}
        {v.nice_to_have.length > 0 && (
          <div>
            <div className="mb-2 text-[13px] font-medium text-muted-foreground">Будет плюсом</div>
            <div className="flex flex-wrap gap-1.5">{v.nice_to_have.map((s) => pill(s, false))}</div>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ---------------- risks ---------------- */

function RisksSection({ v }: { v: VacancyDetail }) {
  if (!v.is_ghost && !v.red_flags.length)
    return (
      <Section title="Проверка вакансии">
        <div className="flex items-center gap-3 p-4 text-[15px]">
          <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-500" />
          <span>Тревожных сигналов не найдено: конкретные задачи и условия</span>
        </div>
      </Section>
    );
  return (
    <Section title="Проверка вакансии">
      {v.is_ghost && (
        <div className="flex gap-3 p-4">
          <Ghost className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-[15px] leading-snug">
            <div className="font-semibold">Подозрение на вечный поиск</div>
            <div className="mt-0.5 text-muted-foreground">{v.ghost_reason ?? "Вакансия регулярно перепубликуется без изменений"}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              Впервые замечена {formatDate(v.first_seen_at)} · перепубликаций: {v.repost_count}
            </div>
          </div>
        </div>
      )}
      {v.red_flags.map((f, i) => (
        <div key={f.code}>
          {(i > 0 || v.is_ghost) && <Separator inset={48} />}
          <div className="flex gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div className="min-w-0 text-[15px] leading-snug">
              <div className="font-semibold">{f.title}</div>
              {f.evidence && <div className="mt-1 border-l-2 border-rose-500/40 pl-2.5 text-[14px] italic text-muted-foreground">«{f.evidence}»</div>}
            </div>
          </div>
        </div>
      ))}
    </Section>
  );
}

/* ---------------- salary vs market ---------------- */

function MarketSection({ v }: { v: VacancyDetail }) {
  const mk = v.salary_market;
  if (!mk) return null;
  const lo = v.salary.rub_from ?? v.salary.rub_to;
  const hi = v.salary.rub_to ?? v.salary.rub_from;
  const min = Math.min(mk.p25 * 0.7, lo ?? Infinity);
  const max = Math.max(mk.p75 * 1.25, hi ?? 0);
  const pct = (n: number) => `${Math.min(100, Math.max(0, ((n - min) / (max - min)) * 100))}%`;
  const mid = lo != null && hi != null ? (lo + hi) / 2 : null;
  const verdict =
    mid == null || v.salary.estimated
      ? null
      : mid >= mk.p75
        ? { t: "Выше рынка", tone: "success" as const }
        : mid >= mk.p50
          ? { t: "На уровне рынка", tone: "accent" as const }
          : mid >= mk.p25
            ? { t: "Ниже медианы", tone: "warning" as const }
            : { t: "Ниже рынка", tone: "danger" as const };
  return (
    <Section title="Зарплата и рынок" footer={`По ${mk.sample} ${plural(mk.sample, "похожей вакансии", "похожим вакансиям", "похожим вакансиям")} того же грейда и стека`}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[15px]">
            Медиана рынка <span className="font-semibold tabular-nums">{formatMoney(mk.p50, "RUB", true)}</span>
          </div>
          {verdict && <Pill tone={verdict.tone}>{verdict.t}</Pill>}
        </div>
        <div className="relative mt-4 h-6">
          <div className="absolute inset-x-0 top-2.5 h-1.5 rounded-full bg-muted" />
          <div className="absolute top-2.5 h-1.5 rounded-full bg-[color-mix(in_srgb,var(--tg-button)_45%,transparent)]" style={{ left: pct(mk.p25), width: `calc(${pct(mk.p75)} - ${pct(mk.p25)})` }} />
          <div className="absolute top-1 h-[18px] w-[2px] -translate-x-1/2 rounded bg-foreground/70" style={{ left: pct(mk.p50) }} />
          {lo != null && hi != null && (
            <div
              className={cn("absolute top-[7px] h-3 rounded-full ring-2 ring-card", v.salary.estimated ? "bg-zinc-400" : "bg-emerald-500")}
              style={{ left: pct(lo), width: `max(12px, calc(${pct(hi)} - ${pct(lo)}))` }}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[12.5px] tabular-nums text-muted-foreground">
          <span>p25 · {formatMoney(mk.p25, "RUB", true)}</span>
          <span>p75 · {formatMoney(mk.p75, "RUB", true)}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-[color-mix(in_srgb,var(--tg-button)_45%,transparent)]" /> 50% рынка
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-4 rounded-full", v.salary.estimated ? "bg-zinc-400" : "bg-emerald-500")} /> {v.salary.estimated ? "оценка для вакансии" : "эта вакансия"}
          </span>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- sources ---------------- */

function SourcesSection({ v }: { v: VacancyDetail }) {
  const merged = v.dedup.merged.length ? v.dedup.merged : v.sources.map((s) => ({ source: s.source, url: s.url, reason: "", score: 1 }));
  const titles = Array.from(new Set(merged.map((x) => sourceMeta(x.source).title)));
  return (
    <Section title="Источники" footer={titles.length > 1 ? `Одна вакансия на ${titles.length} ${plural(titles.length, "площадке", "площадках", "площадках")} — мы склеили дубликаты в одну карточку` : undefined}>
      {titles.length > 1 && <div className="px-4 pb-1 pt-3.5 text-[15px] font-medium">Найдено на {joinRu(titles)}</div>}
      {merged.map((s, i) => (
        <div key={s.url + i}>
          {i > 0 && <Separator inset={52} />}
          <button type="button" onClick={() => openLink(s.url)} className="tg-press flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: sourceMeta(s.source).color }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{sourceMeta(s.source).title}</span>
              {s.reason && <span className="block truncate text-[13px] text-muted-foreground">{i === 0 ? "Основная публикация" : s.reason}</span>}
            </span>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      ))}
    </Section>
  );
}

/* ---------------- description ---------------- */

function DescriptionBody({ v }: { v: VacancyDetail }) {
  // sanitized lazily: only once the user expands the description
  const html = useMemo(() => sanitizeHtml(v.description_html || textToHtml(v.description_text || "")), [v.description_html, v.description_text]);
  return (
    <div
      className="tg-desc border-t-[0.5px] border-[var(--tg-separator)] px-4 py-3 text-[15px] leading-relaxed"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (a?.href) {
          e.preventDefault();
          openLink(a.href);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function DescriptionSection({ v }: { v: VacancyDetail }) {
  const [open, setOpen] = useState(false);
  if (!v.description_html && !v.description_text) return null;
  return (
    <Section>
      <button
        type="button"
        onClick={() => {
          haptic.selection();
          setOpen(!open);
        }}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left"
        aria-expanded={open}
      >
        <span className="text-[16px] font-medium">Оригинальное описание</span>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      <Collapse open={open}>
        <DescriptionBody v={v} />
      </Collapse>
    </Section>
  );
}

/* ---------------- screen ---------------- */

function DetailSkeleton({ card }: { card: Card | null }) {
  return (
    <div>
      {card ? (
        <Header v={card} />
      ) : (
        <div className="rounded-[14px] bg-card p-4">
          <div className="flex gap-3">
            <Skeleton className="h-[52px] w-[52px] rounded-[10px]" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          <Skeleton className="mt-4 h-6 w-4/5" />
          <Skeleton className="mt-3 h-5 w-36" />
        </div>
      )}
      <Skeleton className="mt-5 h-44 w-full rounded-[14px]" />
      <Skeleton className="mt-5 h-56 w-full rounded-[14px]" />
    </div>
  );
}

export function VacancyScreen({ id }: { id: string }) {
  const qc = useQueryClient();
  const goBack = useGoBack("/tg");
  const push = usePushScreen();
  const [menu, setMenu] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  useBackButton(goBack);

  const numId = Number(id);
  const cached = useMemo(() => cardFromCache(qc.getQueriesData({ queryKey: K.feedAll }).map(([, d]) => d), numId), [qc, numId]);
  const q = useQuery({ queryKey: K.vacancy(id), queryFn: () => api.vacancy(id), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1 });
  const profile = useProfile();
  const hasProfile = profileHasSignal(profile.data);
  const match = useQuery({ queryKey: K.match(id), queryFn: () => api.match(id), enabled: hasProfile && q.isSuccess, retry: false });
  const board = useTracker();
  const tracked = findTrackedItem(board.data, numId);

  const add = useMutation({
    mutationFn: () => api.addToTracker(numId),
    onSuccess: (item) => {
      haptic.notify("success");
      setJustAdded(true);
      qc.setQueryData<TrackerBoard>(K.tracker, (b) => (b ? { ...b, columns: { ...b.columns, saved: [item, ...(b.columns.saved ?? [])] } } : b));
      void qc.invalidateQueries({ queryKey: K.tracker });
      toast.success("Добавлено в трекер", { description: "Статус «Сохранено»" });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        void qc.invalidateQueries({ queryKey: K.tracker });
        return;
      }
      haptic.notify("error");
      toast.error("Не удалось добавить в трекер", { description: (e as Error).message });
    },
  });

  const hide = useMutation({
    mutationFn: () => api.hideVacancy(numId),
    onSuccess: () => {
      haptic.notify("success");
      // drop it from every cached feed page right away
      qc.setQueriesData<{ pages: { items: Card[]; next_cursor: string | null; total: number }[]; pageParams: unknown[] }>({ queryKey: K.feedAll }, (d) =>
        d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.filter((x) => x.id !== numId), total: Math.max(0, p.total - 1) })) } : d,
      );
      toast("Вакансия скрыта", { description: "Больше не покажем её в ленте" });
      goBack();
    },
    onError: (e) => toast.error("Не удалось скрыть", { description: (e as Error).message }),
  });

  const v = q.data;
  const primaryUrl = v?.sources[0]?.url ?? cached?.sources[0]?.url;

  const openTracker = (item: TrackerItem) => {
    haptic.impact("light");
    push(`/tg/tracker?item=${item.id}`);
  };

  const mainText = tracked ? (justAdded ? "В трекере ✓" : "Открыть в трекере") : "В трекер";
  const share = () => {
    const link = `https://t.me/${BOT_USERNAME}?startapp=v_${numId}`;
    const title = v?.title ?? cached?.title ?? "Вакансия";
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`${title} — ${v?.company.name ?? ""}`)}`);
  };

  return (
    <div className="pb-20">
      {!isRealTelegram() && (
        <button type="button" onClick={goBack} className="-ml-1 mb-1 inline-flex h-11 items-center gap-0.5 pr-3 text-[16px] text-[var(--tg-link)]">
          <ChevronLeft className="h-6 w-6" /> Назад
        </button>
      )}

      {q.isPending ? (
        <DetailSkeleton card={cached} />
      ) : q.isError || !v ? (
        <EmptyState
          icon={<Ghost className="h-7 w-7" />}
          title={q.error instanceof ApiError && q.error.status === 404 ? "Вакансия не найдена" : "Не удалось загрузить"}
          text={q.error instanceof ApiError && q.error.status === 404 ? "Возможно, её уже сняли с публикации." : (q.error as Error)?.message}
          action={
            <Button variant="tinted" onClick={() => (q.error instanceof ApiError && q.error.status === 404 ? goBack() : q.refetch())}>
              {q.error instanceof ApiError && q.error.status === 404 ? "К ленте" : "Повторить"}
            </Button>
          }
        />
      ) : (
        <div className={cached ? undefined : "tg-fade"}>
          <Header v={v} onMenu={() => setMenu(true)} />
          {primaryUrl && (
            <Button variant="tinted" className="mt-2.5 w-full" onClick={() => openLink(primaryUrl)}>
              <ExternalLink className="h-[18px] w-[18px]" /> Открыть оригинал
            </Button>
          )}
          {profile.isSuccess && !hasProfile ? <ProfilePrompt onOpen={() => push("/tg/profile")} /> : hasProfile ? <MatchSection match={match.data} loading={match.isPending && !match.isError} v={v} /> : null}
          <SummarySection v={v} />
          <SkillsSection v={v} match={match.data} />
          <RisksSection v={v} />
          <MarketSection v={v} />
          <SourcesSection v={v} />
          <DescriptionSection v={v} />
        </div>
      )}

      <MainButton
        visible={!!v}
        text={mainText}
        loading={add.isPending || (board.isPending && !tracked)}
        onClick={() => {
          if (tracked) openTracker(tracked);
          else add.mutate();
        }}
      />

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <div className="overflow-hidden rounded-[14px] bg-card">
          {primaryUrl && (
            <>
              <MenuRow icon={<ExternalLink className="h-5 w-5" />} label="Открыть оригинал" onClick={() => { setMenu(false); openLink(primaryUrl); }} />
              <Separator inset={52} />
            </>
          )}
          <MenuRow icon={<Send className="h-5 w-5" />} label="Поделиться" onClick={() => { setMenu(false); share(); }} />
        </div>
        <div className="mt-3 overflow-hidden rounded-[14px] bg-card">
          <MenuRow
            danger
            icon={<EyeOff className="h-5 w-5" />}
            label="Скрыть вакансию"
            onClick={async () => {
              setMenu(false);
              if (await confirmDialog("Скрыть вакансию? Она больше не появится в ленте и подборках.")) hide.mutate();
            }}
          />
        </div>
        <Button variant="plain" className="mt-2 w-full" onClick={() => setMenu(false)}>
          Отмена
        </Button>
      </Sheet>
    </div>
  );
}

function MenuRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("tg-press flex h-[52px] w-full items-center gap-3 px-4 text-left text-[16px]", danger ? "text-[var(--tg-destructive)]" : "text-foreground")}>
      <span className={danger ? "" : "text-[var(--tg-link)]"}>{icon}</span>
      {label}
    </button>
  );
}
