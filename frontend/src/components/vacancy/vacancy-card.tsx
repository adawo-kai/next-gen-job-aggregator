"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Clock, MapPin, Monitor, Sparkles } from "lucide-react";
import type { VacancyCard as TVacancy } from "@/lib/types";
import { cn, FORMAT_LABEL, GRADE_LABEL, timeAgo } from "@/lib/utils";
import { Card, Skeleton } from "@/components/ui/primitives";
import { AddToTrackerButton, CompanyAvatar, GhostBadge, MatchRing, RedFlagChips, SalaryText, SourceStack, TrustScore, WaterMeter } from "./bits";

const GRADE_TONE: Record<string, string> = {
  intern: "text-teal-600 dark:text-teal-300 bg-teal-500/10 ring-teal-500/25",
  junior: "text-sky-600 dark:text-sky-300 bg-sky-500/10 ring-sky-500/25",
  middle: "text-violet-600 dark:text-violet-300 bg-violet-500/10 ring-violet-500/25",
  senior: "text-fuchsia-600 dark:text-fuchsia-300 bg-fuchsia-500/10 ring-fuchsia-500/25",
  lead: "text-amber-600 dark:text-amber-300 bg-amber-500/10 ring-amber-500/25",
};

export function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return null;
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-semibold ring-1 ring-inset", GRADE_TONE[grade])}>
      {GRADE_LABEL[grade as keyof typeof GRADE_LABEL] ?? grade}
    </span>
  );
}

export function VacancyCard({ v, index = 0, compact = false }: { v: TVacancy; index?: number; compact?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.035, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* no viewport prefetch: an infinite list would fire dozens of RSC requests at once */}
      <Link href={`/vacancies/${v.id}`} prefetch={false} className="group block">
        <Card
          className={cn(
            "relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-[0_12px_40px_-16px_var(--glow)] sm:p-5",
            v.is_ghost && "opacity-[0.82] hover:opacity-100",
          )}
        >
          {/* hover glow */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-primary/10 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />

          <div className="flex gap-4">
            <CompanyAvatar name={v.company.name} logo={v.company.logo_url} size={compact ? 36 : 42} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15.5px] font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
                    {v.title}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">{v.company.name}</span>
                    {v.company.trust_score != null && <TrustScore score={v.company.trust_score} withLabel={false} />}
                    {v.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {v.city}
                      </span>
                    )}
                    {v.format && (
                      <span className="inline-flex items-center gap-1">
                        <Monitor className="h-3 w-3" />
                        {FORMAT_LABEL[v.format]}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(v.published_at)}
                    </span>
                  </div>
                </div>
                {v.match_score != null && <MatchRing score={v.match_score} size={compact ? 42 : 50} />}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <SalaryText salary={v.salary} className="text-[15px]" />
                <GradeBadge grade={v.grade} />
              </div>

              {!compact && v.summary?.what_to_do?.[0] && (
                <p className="mt-2.5 flex gap-2 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
                  <span>{v.summary.what_to_do.slice(0, 2).join(". ")}</span>
                </p>
              )}

              {(v.is_ghost || v.red_flags.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.is_ghost && <GhostBadge reason={v.ghost_reason} repostCount={v.repost_count} />}
                  <RedFlagChips flags={v.red_flags} max={compact ? 1 : 3} />
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {v.tags.slice(0, compact ? 4 : 7).map((t) => (
                  <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] text-muted-foreground ring-1 ring-inset ring-border">
                    {t}
                  </span>
                ))}
                {v.tags.length > (compact ? 4 : 7) && <span className="px-1 py-0.5 text-[11.5px] text-muted-foreground">+{v.tags.length - (compact ? 4 : 7)}</span>}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  <SourceStack sources={v.sources} />
                  {!compact && <WaterMeter score={v.water_score} />}
                </div>
                <AddToTrackerButton vacancyId={v.id} size={compact ? "icon-sm" : "sm"} variant="ghost" className="touch-hit" />
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

export function VacancyCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex gap-4">
        <Skeleton className="h-[42px] w-[42px] rounded-xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-full" />
          <div className="flex gap-1.5">
            {["w-12", "w-16", "w-10", "w-14"].map((w) => (
              <Skeleton key={w} className={`h-5 ${w}`} />
            ))}
          </div>
          <div className="flex justify-between border-t pt-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-7 w-24" />
          </div>
        </div>
      </div>
    </Card>
  );
}
