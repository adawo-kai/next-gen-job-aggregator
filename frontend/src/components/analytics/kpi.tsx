"use client";

import { animate, motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Skeleton } from "@/components/ui/primitives";

export function CountUp({ value: raw, className, format }: { value: number | null | undefined; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  // the API may return null for a metric; animating to null crashes motion and takes the page down
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  useEffect(() => {
    const fmt = format ?? ((n: number) => Math.round(n).toLocaleString("ru-RU"));
    const controls = animate(prev.current, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt(v);
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, format]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      0
    </span>
  );
}

export function KpiTile({
  label,
  value,
  icon: Icon,
  hint,
  tone = "violet",
  index = 0,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  hint?: React.ReactNode;
  tone?: "violet" | "cyan" | "emerald" | "amber" | "zinc";
  index?: number;
}) {
  const toneCls = {
    violet: "from-violet-500/15 text-violet-500 dark:text-violet-300",
    cyan: "from-cyan-500/15 text-cyan-600 dark:text-cyan-300",
    emerald: "from-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    amber: "from-amber-500/15 text-amber-600 dark:text-amber-300",
    zinc: "from-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  }[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="relative h-full overflow-hidden p-4 sm:p-5">
        <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent to-60% opacity-70", toneCls.split(" ")[0])} />
        <div className="relative flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
          <span className={cn("grid h-7 w-7 place-items-center rounded-lg bg-background/60 ring-1 ring-inset ring-border", toneCls)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="relative mt-3 text-[28px] font-semibold leading-none tracking-tight sm:text-[30px]">
          <CountUp value={value} />
        </div>
        {hint && <div className="relative mt-2 text-[12px] text-muted-foreground">{hint}</div>}
      </Card>
    </motion.div>
  );
}

export function KpiSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-28" />
      <Skeleton className="mt-3 h-3 w-20" />
    </Card>
  );
}
