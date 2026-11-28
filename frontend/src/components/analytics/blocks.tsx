"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Lock, Sparkles, TrendingUp } from "lucide-react";
import type { MarketAnalytics, SkillGap } from "@/lib/types";
import { cn, formatMoney, GRADE_LABEL, plural, sourceMeta } from "@/lib/utils";
import { buttonClass } from "@/components/ui/primitives";
import { completeTrend } from "./charts";
import { SourceBadge } from "@/components/vacancy/bits";

const ease = [0.22, 1, 0.36, 1] as const;

/* ---------------- Salary by grade ---------------- */

/** Whole thousands: 53 450 -> "53k", 1 250 000 -> "1,3M". */
const kilo = (v: number) => (v >= 1_000_000 ? `${(Math.round(v / 100_000) / 10).toLocaleString("ru-RU")}M` : `${Math.round(v / 1000)}k`);
/** rough width of an 11px tabular label, px */
const labelW = (s: string) => s.length * 6.6 + 4;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** One grade row: labels are placed in pixels and dropped when they would collide or leave the track. */
function GradeTrack({ d, i, pos }: { d: MarketAnalytics["salary_by_grade"][number]; i: number; pos: (v: number) => number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const x25 = (pos(d.p25) / 100) * W;
  const x50 = (pos(d.p50) / 100) * W;
  const x75 = (pos(d.p75) / 100) * W;
  const t50 = `${kilo(d.p50)} ₽`;
  const t25 = kilo(d.p25);
  const t75 = kilo(d.p75);
  const w50 = labelW(t50);
  const w25 = labelW(t25);
  const w75 = labelW(t75);
  // median on top, centred but kept inside the track
  const left50 = Math.max(0, Math.min(W - w50, x50 - w50 / 2));
  // p25 below, ending at its tick; p75 below, starting at its tick; both hidden if they do not fit
  const show25 = W > 0 && x25 - w25 >= 0;
  const show75 = W > 0 && x75 + w75 <= W && (!show25 || x75 - x25 >= 6);
  return (
    <div ref={ref} className="relative h-9">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted ring-1 ring-inset ring-border" />
      <motion.div
        className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-gradient-to-r from-violet-500/70 to-cyan-400/70 shadow-[0_0_16px_-4px_var(--glow)]"
        initial={{ left: `${pos(d.p50)}%`, width: 0 }}
        animate={{ left: `${pos(d.p25)}%`, width: `${pos(d.p75) - pos(d.p25)}%` }}
        transition={{ duration: 0.8, delay: i * 0.06, ease }}
      />
      <motion.div
        className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow"
        initial={{ opacity: 0, left: `${pos(d.p50)}%` }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4 + i * 0.06 }}
      />
      {W > 0 && (
        <>
          <span className="absolute -top-2 whitespace-nowrap text-[11px] font-semibold tabular-nums text-foreground" style={{ left: left50 }}>
            {t50}
          </span>
          {show25 && (
            <span className="absolute -bottom-2 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground" style={{ left: x25 - w25, width: w25, textAlign: "right" }}>
              {t25}
            </span>
          )}
          {show75 && (
            <span className="absolute -bottom-2 whitespace-nowrap pl-1 text-[11px] tabular-nums text-muted-foreground" style={{ left: x75 }}>
              {t75}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function SalaryByGrade({ data }: { data: MarketAnalytics["salary_by_grade"] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">Нет данных</p>;
  const min = Math.min(...data.map((d) => d.p25)) * 0.85;
  const max = Math.max(...data.map((d) => d.p75)) * 1.05;
  const pos = (v: number) => (max > min ? ((v - min) / (max - min)) * 100 : 50);
  return (
    <div className="space-y-5">
      {data.map((d, i) => (
        <div
          key={d.grade}
          className="grid grid-cols-[64px_1fr] items-center gap-3 sm:grid-cols-[76px_1fr_auto]"
          aria-label={`${GRADE_LABEL[d.grade] ?? d.grade}: медиана ${formatMoney(d.p50, "RUB")}, от ${formatMoney(d.p25, "RUB")} до ${formatMoney(d.p75, "RUB")}`}
          role="group"
        >
          <div>
            <div className="text-[13px] font-medium">{GRADE_LABEL[d.grade] ?? d.grade}</div>
            <div className="text-[11.5px] tabular-nums text-muted-foreground">{d.count.toLocaleString("ru-RU")} вак.</div>
          </div>
          <GradeTrack d={d} i={i} pos={pos} />
          <div className="hidden w-[92px] text-right text-[12px] tabular-nums text-muted-foreground sm:block">
            медиана
            <div className="text-[13px] font-medium text-foreground">{kilo(d.p50)} ₽</div>
          </div>
        </div>
      ))}
      <div className="space-y-1.5 pt-1 text-[12px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-full bg-gradient-to-r from-violet-500/70 to-cyan-400/70" /> 25–75-й перцентиль
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-[3px] rounded-full bg-foreground" /> медиана
          </span>
        </div>
        <p>Отрезок — от 25-го до 75-го перцентиля, черта — медиана</p>
      </div>
    </div>
  );
}

/* ---------------- By source ---------------- */

export function BySource({ data }: { data: MarketAnalytics["by_source"] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const m = sourceMeta(d.source);
        const pct = (d.count / total) * 100;
        const health = d.errors_24h === 0 ? "ok" : d.errors_24h < 10 ? "warn" : "bad";
        return (
          <div key={d.source} className="rounded-xl border bg-muted/30 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <SourceBadge source={d.source} />
                <span className="truncate text-[13px] font-medium">{m.title}</span>
              </div>
              <span className="text-[13px] font-semibold tabular-nums">{d.count.toLocaleString("ru-RU")}</span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full"
                style={{ background: m.color }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, delay: i * 0.08, ease }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11.5px]">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 font-medium",
                  health === "ok" && "text-emerald-600 dark:text-emerald-400",
                  health === "warn" && "text-amber-600 dark:text-amber-300",
                  health === "bad" && "text-rose-600 dark:text-rose-400",
                )}
              >
                <span className="relative flex h-1.5 w-1.5">
                  {health !== "ok" && (
                    <span
                      className={cn(
                        "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                        health === "warn" ? "bg-amber-400" : "bg-rose-400",
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "relative inline-flex h-1.5 w-1.5 rounded-full",
                      health === "ok" ? "bg-emerald-400" : health === "warn" ? "bg-amber-400" : "bg-rose-400",
                    )}
                  />
                </span>
                {d.errors_24h === 0
                  ? "0 ошибок · работает стабильно"
                  : `${d.errors_24h} ${plural(d.errors_24h, "ошибка", "ошибки", "ошибок")} за 24ч`}
              </span>
              <span className="tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- «Что подтянуть» (skill gap) ---------------- */

export function SkillGapList({ data }: { data: SkillGap }) {
  const maxUnlock = Math.max(1, ...data.suggestions.map((s) => s.unlocks));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="text-[32px] font-semibold leading-none tabular-nums tracking-tight">{data.current_matches.toLocaleString("ru-RU")}</div>
        <div className="pb-0.5 text-[13px] text-muted-foreground">
          {plural(data.current_matches, "вакансия", "вакансии", "вакансий")} подходят вам сейчас (совпадение&nbsp;от&nbsp;70%)
        </div>
      </div>
      {data.suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ваш стек уже покрывает рынок — новых рекомендаций нет.</p>
      ) : (
        <div className="space-y-2">
          {data.suggestions.map((s, i) => (
            <motion.div
              key={s.skill}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease }}
              className="group relative overflow-hidden rounded-xl border bg-muted/30 px-3.5 py-3"
            >
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500/12 to-cyan-400/5"
                initial={{ width: 0 }}
                animate={{ width: `${(s.unlocks / maxUnlock) * 100}%` }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.05, ease }}
              />
              <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[13px] text-muted-foreground">Выучи</span>
                <span className="rounded-md bg-background/70 px-2 py-0.5 text-[13px] font-semibold ring-1 ring-inset ring-border">{s.skill}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[13.5px] font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                  +{s.unlocks} {plural(s.unlocks, "вакансия", "вакансии", "вакансий")}
                </span>
                {s.median_salary_rub != null && (
                  <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
                    медиана {formatMoney(s.median_salary_rub, "RUB", true)}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SkillGapTeaser() {
  const fake = [
    { skill: "Kafka", unlocks: 37 },
    { skill: "Kubernetes", unlocks: 29 },
    { skill: "Go", unlocks: 21 },
    { skill: "ClickHouse", unlocks: 14 },
  ];
  return (
    <div className="relative">
      <div className="pointer-events-none select-none space-y-2 blur-[5px]" aria-hidden>
        {fake.map((s) => (
          <div key={s.skill} className="flex items-center gap-3 rounded-xl border bg-muted/30 px-3.5 py-3 text-[13px]">
            <span className="text-muted-foreground">Выучи</span>
            <span className="font-semibold">{s.skill}</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="font-semibold text-emerald-500">+{s.unlocks} вакансий</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="mx-4 max-w-sm rounded-2xl border bg-elevated/90 p-5 text-center shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/25">
            <Lock className="h-4 w-4" />
          </div>
          <div className="text-[14.5px] font-semibold">Что подтянуть — лично для вас</div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Войдите и загрузите резюме — покажем, какой навык откроет больше всего подходящих вакансий.
          </p>
          <Link href="/login?next=/analytics" className={buttonClass({ size: "sm", className: "mt-4" })}>
            <Sparkles className="h-3.5 w-3.5" /> Войти и посмотреть
          </Link>
        </div>
      </div>
    </div>
  );
}

export function TrendDelta({ data: all }: { data: MarketAnalytics["trend"] }) {
  // the current day is incomplete: compare full days only
  const data = completeTrend(all);
  if (data.length < 14) return null;
  const last = data.slice(-7).reduce((s, d) => s + d.count, 0);
  const prev = data.slice(-14, -7).reduce((s, d) => s + d.count, 0) || 1;
  const delta = Math.round(((last - prev) / prev) * 100);
  const up = delta >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        up
          ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
          : "bg-rose-500/10 text-rose-600 ring-rose-500/25 dark:text-rose-400",
      )}
    >
      <TrendingUp className={cn("h-3 w-3", !up && "rotate-180")} />
      {up ? "+" : ""}
      {delta}% за неделю
    </span>
  );
}
