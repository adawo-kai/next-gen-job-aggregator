"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "motion/react";
import { Activity, BarChart3, Building2, Ghost, Layers, LineChart, Monitor, Network, Sparkles, Target, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Grade } from "@/lib/types";
import { GRADE_LABEL } from "@/lib/utils";
import { Card, CardHeader, EmptyState, Select, Skeleton } from "@/components/ui/primitives";
import { KpiSkeleton, KpiTile } from "@/components/analytics/kpi";
import { FormatDonut, TopSkillsChart, TrendChart } from "@/components/analytics/charts";
import { BySource, SalaryByGrade, SkillGapList, SkillGapTeaser, TrendDelta } from "@/components/analytics/blocks";

const GRADES: Grade[] = ["intern", "junior", "middle", "senior", "lead"];

function BlockSkeleton({ h = "h-56" }: { h?: string }) {
  return (
    <div className="space-y-3 px-5 pb-5 pt-4">
      <Skeleton className={`w-full ${h} rounded-xl`} />
    </div>
  );
}

export default function AnalyticsPage() {
  const [grade, setGrade] = useState("");
  const [tag, setTag] = useState("");
  const { isAuthed } = useAuth();

  const market = useQuery({
    queryKey: ["market", tag, grade],
    queryFn: () => api.market({ tag: tag || undefined, grade: grade || undefined }),
    placeholderData: keepPreviousData,
  });
  // keep skill list stable regardless of selected tag
  const allSkills = useQuery({ queryKey: ["market", "", ""], queryFn: () => api.market(), staleTime: 300_000 });
  const gap = useQuery({ queryKey: ["skill-gap"], queryFn: api.skillGap, enabled: isAuthed, retry: false });

  const d = market.data;
  const skillOptions = allSkills.data?.top_skills.map((s) => s.skill) ?? [];
  const ghostShare = d && d.totals.vacancies ? Math.round((d.totals.ghosts / d.totals.vacancies) * 1000) / 10 : 0;
  const dupShare = d && d.totals.vacancies ? Math.round((d.totals.merged_duplicates / (d.totals.vacancies + d.totals.merged_duplicates)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
            <Activity className="h-3 w-3 text-emerald-400" /> Обновляется каждый час
          </div>
          <h1 className="text-gradient text-[28px] font-semibold tracking-tight sm:text-[34px]">Рынок IT-вакансий</h1>
          <p className="mt-1 max-w-xl text-[14px] text-muted-foreground">
            Сводка по всем площадкам после дедупликации: спрос на навыки, вилки по грейдам, динамика и здоровье источников.
          </p>
        </motion.div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Грейд" className="min-w-[132px]">
            <option value="">Все грейды</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {GRADE_LABEL[g]}
              </option>
            ))}
          </Select>
          <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Навык" className="min-w-[150px]">
            <option value="">Все навыки</option>
            {skillOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {market.isError && !d ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="Не удалось загрузить аналитику"
          description={(market.error as Error)?.message}
        />
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {!d ? (
              Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />)
            ) : (
              <>
                <KpiTile index={0} label="Вакансий" value={d.totals.vacancies} icon={Layers} tone="violet" hint={<TrendDelta data={d.trend} />} />
                <KpiTile index={1} label="Компаний" value={d.totals.companies} icon={Building2} tone="cyan" hint="с trust score" />
                <KpiTile index={2} label="Источников" value={d.totals.sources} icon={Network} tone="emerald" hint="hh · Habr · Telegram" />
                <KpiTile index={3} label="Склеено дублей" value={d.totals.merged_duplicates} icon={Sparkles} tone="amber" hint={`${dupShare}% публикаций — дубли`} />
                <KpiTile index={4} label="Вечных вакансий" value={d.totals.ghosts} icon={Ghost} tone="zinc" hint={`${ghostShare}% от всех — скрыты по фильтру`} />
              </>
            )}
          </div>

          <div className={market.isFetching && d ? "opacity-70 transition-opacity" : "transition-opacity"}>
            <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader icon={<BarChart3 className="h-4 w-4" />} title="Топ навыков" description="Число вакансий и медианная зарплата" />
                {d ? <div className="px-3 pb-4 pt-3 sm:px-5">{d.top_skills.length ? <TopSkillsChart data={d.top_skills} /> : <p className="px-2 text-sm text-muted-foreground">Нет данных</p>}</div> : <BlockSkeleton h="h-80" />}
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader icon={<Wallet className="h-4 w-4" />} title="Зарплаты по грейдам" description="Перцентили p25 · p50 · p75, ₽" />
                {d ? <div className="px-5 pb-5 pt-5">{<SalaryByGrade data={d.salary_by_grade} />}</div> : <BlockSkeleton h="h-80" />}
              </Card>
            </div>

            <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  icon={<LineChart className="h-4 w-4" />}
                  title="Динамика публикаций"
                  description="Новые уникальные вакансии за 30 дней"
                  action={d ? <TrendDelta data={d.trend} /> : undefined}
                />
                {d ? <div className="px-2 pb-4 pt-3 sm:px-4">{<TrendChart data={d.trend} />}</div> : <BlockSkeleton />}
              </Card>
              <Card>
                <CardHeader icon={<Network className="h-4 w-4" />} title="Источники" description="Объём и ошибки сбора за 24 часа" />
                {d ? <div className="px-5 pb-5 pt-4">{<BySource data={d.by_source} />}</div> : <BlockSkeleton />}
              </Card>
            </div>

            <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-5">
              <Card className="lg:col-span-2">
                <CardHeader icon={<Monitor className="h-4 w-4" />} title="Формат работы" description="Удалёнка, гибрид и офис" />
                {d ? <div className="px-5 pb-5 pt-4">{<FormatDonut data={d.by_format} />}</div> : <BlockSkeleton />}
              </Card>
              <Card className="relative overflow-hidden lg:col-span-3">
                <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
                <CardHeader
                  icon={<Target className="h-4 w-4" />}
                  title="Skill gap"
                  description="Какой навык откроет больше всего подходящих вакансий"
                />
                <div className="px-5 pb-5 pt-4">
                  {!isAuthed ? (
                    <SkillGapTeaser />
                  ) : gap.isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-40" />
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-11 w-full rounded-xl" />
                      ))}
                    </div>
                  ) : gap.data ? (
                    <SkillGapList data={gap.data} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Не удалось посчитать skill gap. Заполните навыки в профиле.</p>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
