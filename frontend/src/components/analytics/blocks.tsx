"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Lock, Sparkles, TrendingUp } from "lucide-react";
import type { MarketAnalytics, SkillGap } from "@/lib/types";
import { cn, formatMoney, GRADE_LABEL, plural, sourceMeta } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { SourceBadge } from "@/components/vacancy/bits";

const ease = [0.22, 1, 0.36, 1] as const;

/* ---------------- Salary by grade ---------------- */

export function SalaryByGrade({ data }: { data: MarketAnalytics["salary_by_grade"] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">Нет данных</p>;
  const min = Math.min(...data.map((d) => d.p25)) * 0.85;
  const max = Math.max(...data.map((d) => d.p75)) * 1.05;
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="space-y-4">
      {data.map((d, i) => (
        <div key={d.grade} className="grid grid-cols-[64px_1fr] items-center gap-3 sm:grid-cols-[76px_1fr_auto]">
          <div>
            <div className="text-[13px] font-medium">{GRADE_LABEL[d.grade] ?? d.grade}</div>
            <div className="text-[11px] tabular-nums text-muted-foreground">{d.count.toLocaleString("ru-RU")} вак.</div>
          </div>
          <div className="relative h-9">
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
            <span
              className="absolute -top-1.5 -translate-x-1/2 text-[10.5px] font-semibold tabular-nums text-foreground"
              style={{ left: `${pos(d.p50)}%` }}
            >
              {formatMoney(d.p50, "RUB", true)}
            </span>
            <span className="absolute -bottom-1.5 -translate-x-full pr-1 text-[10px] tabular-nums text-muted-foreground" style={{ left: `${pos(d.p25)}%` }}>
              {formatMoney(d.p25, "RUB", true).replace(" ₽", "")}
            </span>
            <span className="absolute -bottom-1.5 pl-1 text-[10px] tabular-nums text-muted-foreground" style={{ left: `${pos(d.p75)}%` }}>
              {formatMoney(d.p75, "RUB", true).replace(" ₽", "")}
            </span>
          </div>
          <div className="hidden w-[92px] text-right text-[12px] tabular-nums text-muted-foreground sm:block">
            медиана
            <div className="text-[13px] font-medium text-foreground">{formatMoney(d.p50, "RUB", true)}</div>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-4 pt-1 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-full bg-gradient-to-r from-violet-500/70 to-cyan-400/70" /> p25 – p75
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-full bg-foreground" /> медиана (p50)
        </span>
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

/* ---------------- Skill gap ---------------- */

export function SkillGapList({ data }: { data: SkillGap }) {
  const maxUnlock = Math.max(1, ...data.suggestions.map((s) => s.unlocks));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="text-[32px] font-semibold leading-none tabular-nums tracking-tight">{data.current_matches.toLocaleString("ru-RU")}</div>
        <div className="pb-0.5 text-[13px] text-muted-foreground">
          {plural(data.current_matches, "вакансия", "вакансии", "вакансий")} подходят вам сейчас (match&nbsp;&gt;&nbsp;70%)
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
          <div className="text-[14.5px] font-semibold">Персональный skill-gap</div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Войдите и загрузите резюме — покажем, какой навык откроет больше всего подходящих вакансий.
          </p>
          <Link href="/login" className="mt-4 inline-block">
            <Button size="sm">
              <Sparkles className="h-3.5 w-3.5" /> Войти и посмотреть
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function TrendDelta({ data }: { data: MarketAnalytics["trend"] }) {
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
