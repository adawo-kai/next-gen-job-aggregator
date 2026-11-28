"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BellRing, GripVertical, StickyNote } from "lucide-react";
import type { TrackerItem } from "@/lib/types";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { CompanyAvatar, MatchRing, SalaryText } from "@/components/vacancy/bits";
import { GradeBadge } from "@/components/vacancy/vacancy-card";

export function nextReminder(item: TrackerItem) {
  const now = Date.now();
  return item.reminders
    .filter((r) => !r.sent && new Date(r.remind_at).getTime() >= now - 60_000)
    .sort((a, b) => +new Date(a.remind_at) - +new Date(b.remind_at))[0];
}

export function TrackerCardView({ item, overlay = false, dragging = false }: { item: TrackerItem; overlay?: boolean; dragging?: boolean }) {
  const v = item.vacancy;
  const rem = nextReminder(item);
  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card p-3 text-left transition-[border-color,box-shadow,opacity] duration-150",
        "hover:border-border-strong hover:shadow-[0_8px_28px_-14px_var(--glow)]",
        overlay && "rotate-[2.2deg] cursor-grabbing border-border-strong shadow-2xl shadow-black/40 ring-1 ring-primary/30",
        dragging && "opacity-30",
      )}
    >
      {/* the title gets the full card width: narrow columns (6 side by side at 1440px) still fit two lines */}
      <div className="flex items-center gap-2">
        <CompanyAvatar name={v.company.name} logo={v.company.logo_url} size={24} />
        <div className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{v.company.name}</div>
        {v.match_score != null ? (
          <MatchRing score={v.match_score} size={28} stroke={3} label={false} />
        ) : (
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
      <div className="mt-2 line-clamp-2 break-words text-[13px] font-semibold leading-snug tracking-tight [hyphens:auto]" title={v.title}>
        {v.title}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <SalaryText salary={v.salary} compact className="text-[12.5px]" />
        <GradeBadge grade={v.grade} />
      </div>

      {item.note && (
        <div className="mt-2 flex gap-1.5 rounded-lg bg-muted/60 px-2 py-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{item.note}</span>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {rem ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600 ring-1 ring-inset ring-amber-500/25 dark:text-amber-300">
            <BellRing className="h-3 w-3" />
            {formatDate(rem.remind_at, true)}
          </span>
        ) : (
          <span />
        )}
        <span className="whitespace-nowrap tabular-nums">{timeAgo(item.updated_at)}</span>
      </div>
    </div>
  );
}

export function SortableTrackerCard({ item, onOpen }: { item: TrackerItem; onOpen: (item: TrackerItem) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.id),
    data: { status: item.status },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription="перемещаемая карточка"
      aria-label={`${item.vacancy.title}, ${item.vacancy.company.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !isDragging) {
          e.preventDefault();
          onOpen(item);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      onClick={() => onOpen(item)}
      className="cursor-grab touch-manipulation select-none outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      <TrackerCardView item={item} dragging={isDragging} />
    </div>
  );
}
