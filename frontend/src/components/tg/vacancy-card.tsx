"use client";

import { AlertTriangle, Ghost, Layers, ShieldCheck } from "lucide-react";
import { memo } from "react";
import type { Salary, VacancyCard as Card } from "@/lib/types";
import { cn, FORMAT_LABEL, formatSalary, GRADE_LABEL, plural, timeAgo, trustTone } from "@/lib/utils";
import { Avatar, MatchRing, Pill, Skeleton } from "./ui";

export function SalaryLine({ salary, className }: { salary: Salary; className?: string }) {
  const text = formatSalary(salary, true);
  if (!text) return <div className={cn("text-[15px] text-muted-foreground", className)}>Зарплата не указана</div>;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span className={cn("text-[16px] font-semibold tabular-nums tracking-tight", salary.estimated && "text-muted-foreground")}>
        {salary.estimated ? `≈ ${text}` : text}
      </span>
      {salary.estimated && <Pill tone="violet">≈ оценка</Pill>}
    </div>
  );
}

export function uniqueSources(v: Pick<Card, "sources">) {
  return Array.from(new Set(v.sources.map((s) => s.source)));
}

export function metaLine(v: Pick<Card, "grade" | "format" | "city">) {
  return [v.grade ? GRADE_LABEL[v.grade] : null, v.format ? FORMAT_LABEL[v.format] : null, v.city].filter(Boolean).join(" · ");
}

export const VacancyCard = memo(function VacancyCard({ v, onOpen }: { v: Card; onOpen: (v: Card) => void }) {
  const sources = uniqueSources(v);
  const meta = metaLine(v);
  return (
    <button
      type="button"
      onClick={() => onOpen(v)}
      className="tg-press block w-full rounded-[14px] bg-card p-3.5 text-left active:bg-[color-mix(in_srgb,var(--tg-section-bg)_92%,var(--tg-text))]"
    >
      <div className="flex gap-3">
        <Avatar src={v.company.logo_url} name={v.company.name} size={42} rounded="xl" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[16px] font-semibold leading-[1.25] tracking-[-0.01em]">{v.title}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[14px] text-muted-foreground">
            <span className="truncate">{v.company.name}</span>
            {v.company.trust_score != null && (
              <span className={cn("inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium tabular-nums", trustTone(v.company.trust_score))}>
                <ShieldCheck className="h-3.5 w-3.5" />
                {v.company.trust_score}
              </span>
            )}
          </div>
        </div>
        {v.match_score != null && <MatchRing score={v.match_score} size={42} stroke={3.5} />}
      </div>

      <SalaryLine salary={v.salary} className="mt-2.5" />
      {meta && <div className="mt-0.5 text-[14px] text-muted-foreground">{meta}</div>}

      {v.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {v.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded-md bg-muted px-2 py-[3px] text-[13px] text-foreground/85">
              {t}
            </span>
          ))}
          {v.tags.length > 4 && <span className="px-1 py-[3px] text-[13px] text-muted-foreground">+{v.tags.length - 4}</span>}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {sources.length > 1 && (
            <Pill tone="accent">
              <Layers className="h-3 w-3" />
              {sources.length} {plural(sources.length, "площадка", "площадки", "площадок")}
            </Pill>
          )}
          {v.is_ghost && (
            <Pill>
              <Ghost className="h-3 w-3" />
              вечная
            </Pill>
          )}
          {v.red_flags.length > 0 && (
            <Pill tone="danger">
              <AlertTriangle className="h-3 w-3" />
              {v.red_flags.length} {plural(v.red_flags.length, "red flag", "red flags", "red flags")}
            </Pill>
          )}
        </div>
        <span className="shrink-0 text-[12.5px] text-muted-foreground">{timeAgo(v.published_at)}</span>
      </div>
    </button>
  );
});

export function VacancyCardSkeleton() {
  return (
    <div className="rounded-[14px] bg-card p-3.5">
      <div className="flex gap-3">
        <Skeleton className="h-[42px] w-[42px] rounded-[10px]" />
        <div className="flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3.5 w-2/5" />
        </div>
      </div>
      <Skeleton className="mt-3.5 h-4 w-32" />
      <Skeleton className="mt-2 h-3.5 w-44" />
      <div className="mt-3 flex gap-1.5">
        <Skeleton className="h-6 w-14" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-12" />
      </div>
    </div>
  );
}
