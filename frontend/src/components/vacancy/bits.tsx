"use client";

import { motion } from "motion/react";
import { AlertTriangle, Bookmark, BookmarkCheck, Droplets, Ghost, Layers, ShieldCheck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import type { RedFlag, Salary, VacancySource } from "@/lib/types";
import { cn, formatDate, formatMoney, formatSalary, hashHue, initials, isConverted, plural, scoreTone, sourceMeta, trustTone } from "@/lib/utils";
export { isConverted };
import { Badge, Button, Tooltip } from "@/components/ui/primitives";

/* ---------------- Company avatar ---------------- */

export function CompanyAvatar({ name, logo, size = 40 }: { name: string; logo?: string | null; size?: number }) {
  const hue = hashHue(name);
  if (logo)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logo}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        style={{ width: size, height: size }}
        className="shrink-0 self-start rounded-xl bg-white object-contain p-1 ring-1 ring-border"
      />
    );
  return (
    <div
      className="grid shrink-0 place-items-center rounded-xl text-[13px] font-semibold text-white ring-1 ring-inset ring-white/10"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 75% 42%))`,
        fontSize: size * 0.34,
      }}
    >
      {initials(name) || "?"}
    </div>
  );
}

/* ---------------- Sources ---------------- */

export function SourceBadge({ source, url }: { source: string; url?: string }) {
  const m = sourceMeta(source);
  const inner = (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold ring-1 ring-inset", m.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.short}
    </span>
  );
  if (!url) return inner;
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="touch-hit transition-opacity hover:opacity-80">
      {inner}
    </a>
  );
}

export function SourceStack({ sources }: { sources: VacancySource[] }) {
  const uniq = Array.from(new Map(sources.map((s) => [s.source, s])).values());
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {uniq.map((s) => (
        <SourceBadge key={s.source + s.url} source={s.source} url={s.url} />
      ))}
      {uniq.length > 1 && (
        <Tooltip
          content={
            <div>
              <div className="mb-1 font-medium">Склеено из {uniq.length} площадок</div>
              {uniq.map((s) => (
                <div key={s.url} className="text-muted-foreground">
                  {sourceMeta(s.source).title} · {formatDate(s.published_at, true)}
                </div>
              ))}
            </div>
          }
        >
          <span className="inline-flex h-5 cursor-default items-center gap-1 rounded-md bg-gradient-to-r from-violet-500/15 to-cyan-500/15 px-1.5 text-[11px] font-medium text-violet-600 ring-1 ring-inset ring-violet-500/30 dark:text-violet-300">
            <Layers className="h-3 w-3" />
            найдено на {uniq.length} {plural(uniq.length, "площадке", "площадках", "площадках")}
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/* ---------------- Match ring ---------------- */

export function MatchRing({ score, size = 52, stroke = 4.5, label = true }: { score: number; size?: number; stroke?: number; label?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <Tooltip content={<span>Совпадение {score}% — насколько вакансия подходит вашему профилю: навыки, грейд, зарплата и формат</span>}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-border-strong" />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tone.stroke}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - score / 100) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 6px ${tone.stroke}55)` }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center leading-none">
            <div className={cn("font-semibold tabular-nums", tone.text)} style={{ fontSize: size * 0.3 }}>
              {score}
            </div>
            {label && size >= 48 && <div className="mt-0.5 text-[8.5px] font-medium uppercase tracking-wider text-muted-foreground">match</div>}
          </div>
        </div>
      </div>
    </Tooltip>
  );
}

/* ---------------- Water meter ---------------- */

/** `score` is the water score (0 = all to the point); the meter shows the opposite — how concrete the text is. */
export function WaterMeter({ score, compact = false }: { score: number; compact?: boolean }) {
  const concrete = Math.max(0, Math.min(100, 100 - score));
  const tone = score >= 60 ? "bg-rose-400" : score >= 35 ? "bg-amber-400" : "bg-emerald-400";
  const label = score >= 60 ? "много воды" : score >= 35 ? "есть вода" : "по делу";
  return (
    <Tooltip
      content={
        <div>
          <div className="font-medium">По делу: {concrete} из 100</div>
          <div className="text-muted-foreground">
            Доля конкретики в тексте: чем меньше воды, тем выше. «Вода» — клише и общие фразы вроде «дружный коллектив» без задач и условий.
          </div>
        </div>
      }
    >
      <div className="flex cursor-help items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} aria-label={`По делу: ${concrete} из 100 — ${label}`}>
        <Droplets className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <div className="flex gap-[2px]" aria-hidden>
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className={cn("h-2.5 w-[3px] rounded-full", i < Math.round(concrete / 10) ? tone : "bg-border-strong")} />
          ))}
        </div>
        {!compact && <span className="text-[12px] text-muted-foreground" aria-hidden>{label}</span>}
      </div>
    </Tooltip>
  );
}

/* ---------------- Тревожные признаки (red flags) ---------------- */

export function RedFlagChips({ flags, max = 3 }: { flags: RedFlag[]; max?: number }) {
  if (!flags.length) return null;
  const shown = flags.slice(0, max);
  const rest = flags.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((f) => (
        <Tooltip
          key={f.code}
          content={
            <div>
              <div className="mb-1 flex items-center gap-1.5 font-medium text-rose-500 dark:text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" /> {f.title}
              </div>
              <div className="text-muted-foreground">Найдено в тексте:</div>
              <div className="mt-0.5 italic">{f.evidence}</div>
            </div>
          }
        >
          <span className="inline-flex h-5 cursor-help items-center gap-1 rounded-md bg-rose-500/10 px-1.5 text-[11px] font-medium text-rose-600 ring-1 ring-inset ring-rose-500/25 dark:text-rose-300">
            <AlertTriangle className="h-3 w-3" />
            {f.title}
          </span>
        </Tooltip>
      ))}
      {rest > 0 && <Badge tone="danger">+{rest}</Badge>}
    </div>
  );
}

/* ---------------- Ghost ---------------- */

export function GhostBadge({ reason, repostCount }: { reason: string | null; repostCount?: number }) {
  return (
    <Tooltip
      content={
        <div>
          <div className="font-medium">Подозрение на вечный поиск</div>
          <div className="text-muted-foreground">{reason ?? "Вакансия регулярно перепубликуется без изменений"}</div>
          {repostCount ? <div className="mt-1 text-muted-foreground">Перепубликаций: {repostCount}</div> : null}
        </div>
      }
    >
      <span className="inline-flex h-5 cursor-help items-center gap-1 rounded-md bg-zinc-500/10 px-1.5 text-[11px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-500/30 dark:text-zinc-300">
        <Ghost className="h-3 w-3" />
        Подозрение на вечный поиск
      </span>
    </Tooltip>
  );
}

/* ---------------- Trust ---------------- */

export function TrustScore({ score, withLabel = true }: { score: number; withLabel?: boolean }) {
  return (
    <Tooltip
      content={
        <div>
          <div className="font-medium">Доверие к компании: {score} из 100</div>
          <div className="text-muted-foreground">Считается по доле вечных вакансий, тревожных признаков в текстах и скрытых зарплат.</div>
        </div>
      }
    >
      <span className={cn("inline-flex cursor-default items-center gap-1 text-[12px] font-medium tabular-nums", trustTone(score))}>
        <ShieldCheck className="h-3.5 w-3.5" />
        {withLabel && <span className="text-muted-foreground font-normal">доверие</span>}
        {score}
      </span>
    </Tooltip>
  );
}

/* ---------------- Salary ---------------- */


export function SalaryText({ salary, className, compact = false }: { salary: Salary; className?: string; compact?: boolean }) {
  const text = formatSalary(salary, compact);
  if (!text) return <span className={cn("text-muted-foreground", className)}>З/п не указана</span>;
  const converted = isConverted(salary);
  const original = converted ? formatSalary({ ...salary, converted_from: null, converted_to: null }, compact) : null;

  // an estimate must look weaker than a real salary: muted, regular weight, explained in a tooltip
  if (salary.estimated)
    return (
      <Tooltip
        content={
          <div>
            <div>Медиана по похожим вакансиям: зарплата не указана работодателем</div>
            {original && <div className="mt-1 text-muted-foreground">В исходной валюте: ≈ {original}</div>}
          </div>
        }
      >
        <span
          tabIndex={0}
          className={cn("inline-flex cursor-help flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded font-normal text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          <span className="tabular-nums">≈ {text}</span>
          <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-border">оценка рынка</span>
        </span>
      </Tooltip>
    );

  const rub = salary.currency !== "RUB" && salary.rub_from != null && !converted && salary.converted_from == null ? formatMoney(salary.rub_from, "RUB", true) : null;
  const main = <span className="font-semibold tabular-nums tracking-tight">{converted ? `≈ ${text}` : text}</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      {converted && original ? (
        <Tooltip content={`Работодатель указал: ${original}. Пересчитано по текущему курсу`}>
          <span tabIndex={0} className="cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {main}
          </span>
        </Tooltip>
      ) : (
        main
      )}
      {rub && <span className="text-[12px] text-muted-foreground">≈ {rub}</span>}
      {salary.gross != null && <span className="text-[12px] text-muted-foreground">{salary.gross ? "до вычета" : "на руки"}</span>}
    </span>
  );
}

/* ---------------- Add to tracker ---------------- */

export function AddToTrackerButton({ vacancyId, size = "sm", variant = "secondary", className, full }: { vacancyId: number; size?: "sm" | "md" | "icon-sm" | "icon"; variant?: "secondary" | "primary" | "ghost" | "outline"; className?: string; full?: boolean }) {
  const { isAuthed } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [added, setAdded] = useState(false);
  const m = useMutation({
    mutationFn: () => api.addToTracker(vacancyId),
    onSuccess: () => {
      setAdded(true);
      track("tracker_add");
      qc.invalidateQueries({ queryKey: ["tracker"] });
      toast.success("Добавлено в трекер", {
        description: "Колонка «Сохранено»",
        action: { label: "Открыть", onClick: () => router.push("/tracker") },
      });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        setAdded(true);
        toast("Уже в трекере", { action: { label: "Открыть", onClick: () => router.push("/tracker") } });
      } else toast.error("Не удалось добавить", { description: (e as Error).message });
    },
  });
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthed) {
      toast("Войдите, чтобы вести трекер откликов", { action: { label: "Войти", onClick: () => router.push("/login") } });
      return;
    }
    if (!added) m.mutate();
  };
  const Icon = added ? BookmarkCheck : Bookmark;
  const iconOnly = size === "icon-sm" || size === "icon";
  return (
    <Button
      size={size}
      variant={added ? "secondary" : variant}
      loading={m.isPending}
      onClick={onClick}
      className={cn(added && "text-emerald-500 dark:text-emerald-400", full && "w-full", className)}
      aria-label="В трекер"
    >
      {!m.isPending && <Icon className="h-4 w-4" />}
      {!iconOnly && (added ? "В трекере" : "В трекер")}
    </Button>
  );
}
