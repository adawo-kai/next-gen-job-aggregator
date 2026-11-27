"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bot,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardList,
  Cpu,
  ExternalLink,
  FileText,
  Gift,
  Ghost,
  GitMerge,
  Lock,
  MapPin,
  Monitor,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { sanitizeHtml, textToHtml } from "@/lib/sanitize";
import { useAuth } from "@/lib/auth";
import type { MatchExplanation, VacancyDetail } from "@/lib/types";
import { cn, formatDate, formatMoney, FORMAT_LABEL, scoreTone, sourceMeta, timeAgo } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, Tooltip } from "@/components/ui/primitives";
import { AddToTrackerButton, CompanyAvatar, GhostBadge, MatchRing, SalaryText, SourceBadge, SourceStack, TrustScore, WaterMeter } from "./bits";
import { GradeBadge, VacancyCard } from "./vacancy-card";

const FACTOR_LABEL: Record<string, string> = {
  skills: "Навыки",
  grade: "Грейд",
  salary: "Зарплата",
  format: "Формат работы",
  stop_words: "Стоп-слова",
};

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

/* ---------------- AI summary ---------------- */

function SummaryBlocks({ v }: { v: VacancyDetail }) {
  if (!v.summary) return null;
  const blocks = [
    { title: "Что делать", icon: Wrench, items: v.summary.what_to_do, tone: "from-violet-500/15 text-violet-500 dark:text-violet-300" },
    { title: "Что требуют", icon: ClipboardList, items: v.summary.requirements, tone: "from-sky-500/15 text-sky-500 dark:text-sky-300" },
    { title: "Условия", icon: Gift, items: v.summary.conditions, tone: "from-emerald-500/15 text-emerald-500 dark:text-emerald-300" },
  ];
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<Sparkles className="h-4 w-4 text-violet-400" />}
        title="AI-саммари"
        description="Суть вакансии в трёх блоках — без воды"
        action={<EnrichmentBadge v={v} />}
      />
      <div className="grid gap-3 p-5 md:grid-cols-3">
        {blocks.map((b, i) => (
          <motion.div
            key={b.title}
            {...fade}
            transition={{ delay: 0.05 * i }}
            className={cn("rounded-xl border bg-gradient-to-b to-transparent p-4", b.tone.split(" ")[0])}
          >
            <div className={cn("mb-3 flex items-center gap-2 text-[13px] font-semibold", b.tone.split(" ").slice(1).join(" "))}>
              <b.icon className="h-4 w-4" />
              {b.title}
            </div>
            <ul className="space-y-2">
              {b.items.map((it) => (
                <li key={it} className="flex gap-2 text-[13.5px] leading-relaxed text-foreground/90">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                  {it}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

function EnrichmentBadge({ v }: { v: VacancyDetail }) {
  const llm = v.enrichment.method === "llm";
  return (
    <Tooltip
      content={
        <div className="space-y-0.5">
          <div className="font-medium">{llm ? "Обогащено LLM" : "Обогащено правилами (офлайн-фолбэк)"}</div>
          <div className="text-muted-foreground">Модель: {v.enrichment.model}</div>
          <div className="text-muted-foreground">Промпт: {v.enrichment.prompt_version}</div>
          <div className="text-muted-foreground">{formatDate(v.enrichment.enriched_at, true)}</div>
        </div>
      }
    >
      <span
        className={cn(
          "inline-flex h-6 cursor-default items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium ring-1 ring-inset",
          llm ? "bg-violet-500/10 text-violet-600 ring-violet-500/30 dark:text-violet-300" : "bg-zinc-500/10 text-zinc-600 ring-zinc-500/30 dark:text-zinc-300",
        )}
      >
        {llm ? <Bot className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
        {llm ? "LLM" : "Rules"}
      </span>
    </Tooltip>
  );
}

/* ---------------- Skills ---------------- */

function SkillsCard({ v, match }: { v: VacancyDetail; match?: MatchExplanation }) {
  const matched = new Set((match?.matched_skills ?? []).map((s) => s.toLowerCase()));
  const state = (s: string) => (!match ? "neutral" : matched.has(s.toLowerCase()) ? "ok" : "miss");
  const Pill = ({ s, must }: { s: string; must: boolean }) => {
    const st = state(s);
    return (
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium ring-1 ring-inset",
          st === "ok" && "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300",
          st === "miss" && (must ? "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-300" : "bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-300"),
          st === "neutral" && "bg-muted text-foreground/85 ring-border",
        )}
      >
        {st === "ok" && <Check className="h-3.5 w-3.5" />}
        {st === "miss" && <X className="h-3.5 w-3.5" />}
        {s}
      </span>
    );
  };
  return (
    <Card>
      <CardHeader
        icon={<Target className="h-4 w-4" />}
        title="Навыки"
        description={match ? `Совпало ${match.matched_skills.length} из ${v.must_have.length + v.nice_to_have.length}` : "Войдите, чтобы увидеть совпадения с вашим профилем"}
      />
      <div className="space-y-4 p-5">
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Обязательно</div>
          <div className="flex flex-wrap gap-1.5">
            {v.must_have.map((s) => (
              <Pill key={s} s={s} must />
            ))}
          </div>
        </div>
        {v.nice_to_have.length > 0 && (
          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Будет плюсом</div>
            <div className="flex flex-wrap gap-1.5">
              {v.nice_to_have.map((s) => (
                <Pill key={s} s={s} must={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------------- Match ---------------- */

function MatchCard({ match, loading }: { match?: MatchExplanation; loading: boolean }) {
  const { isAuthed } = useAuth();
  if (!isAuthed)
    return (
      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none select-none space-y-3 blur-[3px]">
          {[80, 55, 100, 70, 100].map((w, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary/50" style={{ width: `${w}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="absolute inset-0 grid place-items-center bg-card/60 backdrop-blur-[1px]">
          <div className="text-center">
            <Lock className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <div className="text-[14px] font-semibold">Объяснимый match score</div>
            <div className="mb-3 text-[12.5px] text-muted-foreground">Сколько баллов дал каждый фактор</div>
            <Link href="/login">
              <Button size="sm">Войти</Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  if (loading || !match)
    return (
      <Card className="space-y-4 p-5">
        <Skeleton className="h-14 w-14 rounded-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </Card>
    );
  const tone = scoreTone(match.score);
  return (
    <Card className="overflow-hidden">
      <div className="relative flex items-center gap-4 border-b p-5">
        <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full blur-3xl" style={{ background: `${tone.stroke}22` }} />
        <MatchRing score={match.score} size={64} stroke={5} />
        <div>
          <div className="text-[15px] font-semibold">Match score</div>
          <div className="text-[12.5px] text-muted-foreground">
            {match.score >= 75 ? "Отличное совпадение — стоит откликнуться" : match.score >= 50 ? "Хорошее совпадение, есть пробелы" : "Слабое совпадение"}
          </div>
        </div>
      </div>
      <div className="space-y-3.5 p-5">
        {match.breakdown.map((b, i) => {
          const pts = Math.round(b.weight * b.score * 100);
          const max = Math.round(b.weight * 100);
          const t = scoreTone(b.score * 100);
          return (
            <div key={b.factor}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-medium">{FACTOR_LABEL[b.factor] ?? b.factor}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className={cn("font-semibold", t.text)}>+{pts}</span> / {max}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className={cn("h-full rounded-full", t.bg)}
                  initial={{ width: 0 }}
                  animate={{ width: `${b.score * 100}%` }}
                  transition={{ duration: 0.7, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{b.note}</div>
            </div>
          );
        })}
        {match.missing_must.length > 0 && (
          <div className="rounded-xl bg-rose-500/[0.07] p-3 text-[12.5px] ring-1 ring-inset ring-rose-500/20">
            <span className="font-medium text-rose-600 dark:text-rose-300">Не хватает обязательных: </span>
            {match.missing_must.join(", ")}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------------- Salary vs market ---------------- */

function SalaryMarket({ v }: { v: VacancyDetail }) {
  const m = v.salary_market;
  if (!m) return null;
  const lo = v.salary.rub_from ?? v.salary.rub_to;
  const hi = v.salary.rub_to ?? v.salary.rub_from;
  const min = Math.min(m.p25 * 0.6, lo ?? Infinity);
  const max = Math.max(m.p75 * 1.3, hi ?? 0);
  const pos = (n: number) => `${((n - min) / (max - min)) * 100}%`;
  const mid = lo != null && hi != null ? (lo + hi) / 2 : null;
  const verdict =
    mid == null ? null : mid >= m.p75 ? { t: "Выше рынка", c: "success" as const } : mid >= m.p50 ? { t: "На уровне рынка", c: "info" as const } : mid >= m.p25 ? { t: "Ниже медианы", c: "warning" as const } : { t: "Ниже рынка", c: "danger" as const };
  return (
    <Card>
      <CardHeader
        icon={<TrendingUp className="h-4 w-4" />}
        title="Зарплата vs рынок"
        description={`${m.sample} похожих вакансий того же грейда и стека`}
        action={verdict && !v.salary.estimated ? <Badge tone={verdict.c}>{verdict.t}</Badge> : null}
      />
      <div className="px-5 pb-5 pt-8">
        <div className="relative h-10">
          <div className="absolute inset-x-0 top-4 h-2 rounded-full bg-muted" />
          <div className="absolute top-4 h-2 rounded-full bg-gradient-to-r from-violet-500/50 to-cyan-400/50" style={{ left: pos(m.p25), width: `calc(${pos(m.p75)} - ${pos(m.p25)})` }} />
          <div className="absolute top-2 h-6 w-0.5 rounded bg-foreground/70" style={{ left: pos(m.p50) }} />
          {[
            { k: "медиана", v: m.p50 },
            { k: "p25", v: m.p25 },
            { k: "p75", v: m.p75 },
          ]
            // narrow markets put percentiles next to each other: keep the median, drop labels that would collide
            .reduce<{ k: string; v: number }[]>((shown, p) => {
              const f = (p.v - min) / (max - min);
              return shown.some((s) => Math.abs((s.v - min) / (max - min) - f) < 0.12) ? shown : [...shown, p];
            }, [])
            .map((p) => (
            <div key={p.k} className="absolute -top-5 -translate-x-1/2 text-center text-[11px] text-muted-foreground" style={{ left: pos(p.v) }}>
              <span className="tabular-nums">{formatMoney(p.v, "RUB", true)}</span>
            </div>
          ))}
          {lo != null && hi != null && (
            <motion.div
              initial={{ opacity: 0, scaleX: 0.3 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className={cn("absolute top-[13px] h-3.5 rounded-full ring-2 ring-background", v.salary.estimated ? "bg-zinc-400/70" : "bg-emerald-400")}
              style={{ left: pos(lo), width: `max(10px, calc(${pos(hi)} - ${pos(lo)}))`, boxShadow: v.salary.estimated ? undefined : "0 0 16px #34d39966" }}
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-gradient-to-r from-violet-500/50 to-cyan-400/50" /> p25–p75 рынка
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-4 rounded-full", v.salary.estimated ? "bg-zinc-400/70" : "bg-emerald-400")} /> {v.salary.estimated ? "оценка для вакансии" : "эта вакансия"}
          </span>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Dedup ---------------- */

function DedupPanel({ v }: { v: VacancyDetail }) {
  return (
    <Card>
      <CardHeader
        icon={<GitMerge className="h-4 w-4" />}
        title="Источники и дедупликация"
        description={v.dedup.cluster_size > 1 ? `Одна вакансия — ${v.dedup.cluster_size} публикации, склеены в кластер` : "Опубликована на одной площадке"}
      />
      <div className="relative p-5">
        {v.dedup.merged.length > 1 && <div className="absolute bottom-9 left-[33px] top-9 w-px bg-gradient-to-b from-border-strong via-border-strong to-transparent" />}
        <div className="space-y-3">
          {v.dedup.merged.map((m, i) => (
            <motion.a
              key={m.url}
              href={m.url}
              target="_blank"
              rel="noreferrer"
              {...fade}
              transition={{ delay: 0.06 * i }}
              className="group relative flex items-center gap-3 rounded-xl border bg-muted/30 p-3 transition-colors hover:border-border-strong hover:bg-muted/60"
            >
              <span className="relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card ring-1 ring-border-strong">
                <span className={cn("h-2 w-2 rounded-full", sourceMeta(m.source).dot)} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{sourceMeta(m.source).title}</span>
                  {i === 0 && <Badge tone="primary">каноническая</Badge>}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">{m.reason}</div>
              </div>
              <Tooltip content="Уверенность склейки">
                <span className={cn("text-[12.5px] font-semibold tabular-nums", scoreTone(m.score * 100).text)}>{m.score.toFixed(2)}</span>
              </Tooltip>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </motion.a>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Red flags ---------------- */

function RedFlagsCard({ v }: { v: VacancyDetail }) {
  return (
    <Card>
      <CardHeader
        icon={<AlertTriangle className={cn("h-4 w-4", v.red_flags.length ? "text-rose-400" : "")} />}
        title="Red flags"
        description={v.red_flags.length ? `Найдено ${v.red_flags.length} — с цитатами из текста` : "Тревожных сигналов не найдено"}
        action={<WaterMeter score={v.water_score} />}
      />
      <div className="space-y-2 p-5">
        {v.is_ghost && (
          <div className="flex gap-3 rounded-xl bg-zinc-500/[0.08] p-3 ring-1 ring-inset ring-zinc-500/25">
            <Ghost className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            <div className="text-[13px]">
              <div className="font-medium">Подозрение на вечный поиск</div>
              <div className="text-muted-foreground">{v.ghost_reason}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">Впервые замечена {formatDate(v.first_seen_at)} · перепубликаций: {v.repost_count}</div>
            </div>
          </div>
        )}
        {v.red_flags.map((f) => (
          <div key={f.code} className="flex gap-3 rounded-xl bg-rose-500/[0.06] p-3 ring-1 ring-inset ring-rose-500/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div className="text-[13px]">
              <div className="font-medium">{f.title}</div>
              <div className="italic text-muted-foreground">{f.evidence}</div>
            </div>
          </div>
        ))}
        {!v.is_ghost && v.red_flags.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/[0.07] p-3 text-[13px] text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-300">
            <BadgeCheck className="h-4 w-4" /> Текст выглядит честно: конкретные задачи и условия
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------------- Description ---------------- */

/* Always in the DOM (server-rendered, so search engines index the full text); long texts are clamped. */
function Description({ v }: { v: VacancyDetail }) {
  const [open, setOpen] = useState(false);
  const html = sanitizeHtml(v.description_html || textToHtml(v.description_text || ""));
  const long = (v.description_text?.length ?? html.length) > 900;
  if (!html.trim()) return null;
  return (
    <Card>
      <div className="flex items-center gap-3 p-5 pb-0">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-inset ring-border">
          <FileText className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold">Описание вакансии</h2>
          <div className="text-[13px] text-muted-foreground">Как опубликовал работодатель</div>
        </div>
      </div>
      <div className="relative">
        <div
          className={cn("prose-desc overflow-hidden break-words px-5 py-4 text-[14px] text-foreground/85 sm:text-[13.5px]", long && !open && "max-h-[320px]")}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-2xl bg-gradient-to-t from-card to-transparent" />}
      </div>
      {long && (
        <button onClick={() => setOpen(!open)} className="flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 border-t text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          {open ? "Свернуть" : "Показать полностью"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      )}
    </Card>
  );
}

/* ---------------- Page ---------------- */

/** `initial` is the anonymous server-side copy: it paints instantly (and is what crawlers see);
    signed-in users then refetch their personalised copy (match score) in the background. */
export function VacancyDetailPage({ id, initial }: { id: string; initial?: VacancyDetail }) {
  const { isAuthed } = useAuth();
  const q = useQuery({
    queryKey: ["vacancy", id, isAuthed],
    queryFn: () => api.vacancy(id),
    initialData: !isAuthed ? initial : undefined,
    placeholderData: initial,
    staleTime: !isAuthed && initial ? 60_000 : undefined,
  });
  const match = useQuery({ queryKey: ["match", id], queryFn: () => api.match(id), enabled: isAuthed, retry: false });
  const similar = useQuery({ queryKey: ["similar", id], queryFn: () => api.similar(id) });

  // a failed personalised refetch keeps showing the server copy
  const v = q.data ?? initial;
  if (!v && q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Card className="space-y-4 p-6">
          <div className="flex gap-4">
            <Skeleton className="h-14 w-14 rounded-xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  if (!v) {
    const err = q.error;
    const missing = err instanceof ApiError && (err.status === 404 || err.status === 422);
    return missing || !err ? (
      <EmptyState
        icon={<CircleDot className="h-5 w-5" />}
        title="Вакансия не найдена"
        description="Возможно, её сняли с публикации или ссылка устарела."
        action={
          <Link href="/">
            <Button variant="secondary">К поиску</Button>
          </Link>
        }
      />
    ) : (
      <EmptyState
        icon={<WifiOff className="h-5 w-5" />}
        title="Не удалось загрузить вакансию"
        description={err instanceof ApiError && err.status ? err.detail : "Сервер временно недоступен. Проверьте соединение и попробуйте ещё раз."}
        action={
          <Button onClick={() => q.refetch()} loading={q.isFetching}>
            <RefreshCw className="h-4 w-4" /> Повторить
          </Button>
        }
      />
    );
  }
  const primary = v.sources[0];
  const score = match.data?.score ?? v.match_score;

  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Все вакансии
      </Link>

      {/* header */}
      <motion.div {...fade} transition={{ duration: 0.4 }}>
        <Card className="relative overflow-hidden p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
            <CompanyAvatar name={v.company.name} logo={v.company.logo_url} size={56} />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <GradeBadge grade={v.grade} />
                {v.is_ghost && <GhostBadge reason={v.ghost_reason} repostCount={v.repost_count} />}
                <SourceStack sources={v.sources} />
              </div>
              <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] sm:text-[28px] sm:leading-tight">{v.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] text-muted-foreground">
                <span className="font-medium text-foreground">{v.company.name}</span>
                <TrustScore score={v.company.trust_score} />
                {v.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {v.city}
                    {v.country ? `, ${v.country}` : ""}
                  </span>
                )}
                {v.format && (
                  <span className="inline-flex items-center gap-1">
                    <Monitor className="h-3.5 w-3.5" />
                    {FORMAT_LABEL[v.format]}
                  </span>
                )}
                <span>{timeAgo(v.published_at)}</span>
              </div>
              <div className="mt-4">
                <SalaryText salary={v.salary} className="text-xl" />
              </div>
            </div>
            <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end">
              {score != null && <MatchRing score={score} size={72} stroke={5.5} />}
              <div className="flex min-w-0 flex-1 flex-wrap gap-2 sm:flex-none">
                <AddToTrackerButton vacancyId={v.id} size="md" variant="primary" className="h-11 flex-1 sm:h-9 sm:flex-none" />
                {primary && (
                  <a href={primary.url} target="_blank" rel="noopener noreferrer nofollow" className="flex-1 sm:flex-none">
                    <Button variant="secondary" className="h-11 w-full sm:h-9">
                      <ExternalLink className="h-4 w-4" /> Оригинал
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <SummaryBlocks v={v} />
          <SkillsCard v={v} match={match.data} />
          <SalaryMarket v={v} />
          <Description v={v} />
        </div>
        <div className="space-y-4">
          <MatchCard match={match.data} loading={match.isLoading} />
          <RedFlagsCard v={v} />
          <DedupPanel v={v} />
        </div>
      </div>

      {similar.data && similar.data.length > 0 && (
        <section className="pt-6">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Похожие вакансии</h2>
              <p className="text-[13px] text-muted-foreground">По стеку, грейду и семантике описания</p>
            </div>
            <div className="hidden gap-1 sm:flex">
              {Array.from(new Set(similar.data.flatMap((s) => s.sources.map((x) => x.source)))).map((s) => (
                <SourceBadge key={s} source={s} />
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {similar.data.map((s, i) => (
              <VacancyCard key={s.id} v={s} index={i} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
