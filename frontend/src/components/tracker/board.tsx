"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { api } from "@/lib/api";
import type { TrackerBoard, TrackerItem, TrackerStatus } from "@/lib/types";
import { cn, STATUS_META, STATUS_ORDER } from "@/lib/utils";
import { SortableTrackerCard, TrackerCardView } from "./tracker-card";

export const TRACKER_KEY = ["tracker"] as const;

export function normalizeBoard(b: TrackerBoard | undefined): Record<TrackerStatus, TrackerItem[]> {
  const cols = {} as Record<TrackerStatus, TrackerItem[]>;
  for (const s of STATUS_ORDER) cols[s] = [...(b?.columns?.[s] ?? [])];
  return cols;
}

/** Hook that moves an item to another status with optimistic update + revert. */
export function useMoveItem() {
  const qc = useQueryClient();
  return async function move(itemId: string, to: TrackerStatus, opts: { snapshot?: TrackerBoard; position?: number; skipOptimistic?: boolean } = {}) {
    const snapshot = opts.snapshot ?? qc.getQueryData<TrackerBoard>(TRACKER_KEY);
    if (!snapshot) return;
    const fromCols = normalizeBoard(snapshot);
    const origin = STATUS_ORDER.find((s) => fromCols[s].some((i) => String(i.id) === itemId));
    if (!origin) return;

    if (!opts.skipOptimistic) {
      const cols = normalizeBoard(qc.getQueryData<TrackerBoard>(TRACKER_KEY));
      let moving: TrackerItem | undefined;
      for (const s of STATUS_ORDER) {
        const idx = cols[s].findIndex((i) => String(i.id) === itemId);
        if (idx >= 0) moving = cols[s].splice(idx, 1)[0];
      }
      if (moving) {
        const pos = opts.position ?? cols[to].length;
        cols[to].splice(pos, 0, { ...moving, status: to, updated_at: new Date().toISOString() });
        qc.setQueryData<TrackerBoard>(TRACKER_KEY, { columns: cols });
      }
    }

    const finalCols = normalizeBoard(qc.getQueryData<TrackerBoard>(TRACKER_KEY));
    const position = Math.max(0, finalCols[to].findIndex((i) => String(i.id) === itemId));

    try {
      await api.patchTracker(itemId, origin === to ? { position } : { status: to, position });
      if (origin !== to) {
        if (to === "applied") {
          toast.success(`Перенесено в «${STATUS_META[to].title}»`, {
            description: "Через 3 дня напомним написать HR, если не будет ответа",
          });
        } else if (to === "offer") {
          toast.success("Поздравляем с оффером!", { description: "Не забудьте ответить работодателю в срок" });
        } else {
          toast.success(`Перенесено в «${STATUS_META[to].title}»`);
        }
      }
      qc.invalidateQueries({ queryKey: TRACKER_KEY });
      qc.invalidateQueries({ queryKey: ["tracker-events", itemId] });
    } catch (e) {
      qc.setQueryData<TrackerBoard>(TRACKER_KEY, snapshot);
      toast.error("Переход невозможен", {
        description: (e as Error).message || `Нельзя перенести из «${STATUS_META[origin].title}» в «${STATUS_META[to].title}»`,
      });
    }
  };
}

function Column({
  status,
  items,
  highlighted,
  onOpen,
}: {
  status: TrackerStatus;
  items: TrackerItem[];
  highlighted: boolean;
  onOpen: (i: TrackerItem) => void;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  return (
    <div
      className={cn(
        "flex min-h-[420px] snap-start flex-col rounded-2xl border bg-muted/30 transition-[background,border-color,box-shadow] duration-200",
        highlighted && "border-border-strong bg-muted/60 shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_10%,transparent)]",
      )}
    >
      <div className="relative flex items-center gap-2 px-3 pb-2 pt-3">
        <span
          className="absolute inset-x-3 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.color}88, transparent)` }}
        />
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} style={{ boxShadow: `0 0 10px ${meta.color}` }} />
        <span className="text-[13px] font-semibold tracking-tight">{meta.title}</span>
        <span className="ml-auto rounded-md bg-background/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
          {items.length}
        </span>
      </div>
      <SortableContext id={status} items={items.map((i) => String(i.id))} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 p-2 pt-1">
          {items.map((it) => (
            <SortableTrackerCard key={it.id} item={it} onOpen={onOpen} />
          ))}
          {items.length === 0 && (
            <div
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-8 text-center text-[12px] text-muted-foreground/80 transition-colors",
                highlighted && "border-primary/40 text-foreground",
              )}
            >
              <Inbox className="h-4 w-4" />
              Перетащите сюда
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export function KanbanBoard({ board, onOpen }: { board: TrackerBoard; onOpen: (i: TrackerItem) => void }) {
  const qc = useQueryClient();
  const move = useMoveItem();
  const cols = normalizeBoard(board);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TrackerStatus | null>(null);
  const snapshot = useRef<TrackerBoard | null>(null);
  const lastDragEnd = useRef(0);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string, c = cols): TrackerStatus | null => {
    if ((STATUS_ORDER as string[]).includes(id)) return id as TrackerStatus;
    return STATUS_ORDER.find((s) => c[s].some((i) => String(i.id) === id)) ?? null;
  };

  const activeItem = activeId ? STATUS_ORDER.flatMap((s) => cols[s]).find((i) => String(i.id) === activeId) : null;

  const onDragStart = (e: DragStartEvent) => {
    snapshot.current = qc.getQueryData<TrackerBoard>(TRACKER_KEY) ?? board;
    setActiveId(String(e.active.id));
    setOverCol(findContainer(String(e.active.id)));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    const from = findContainer(aId);
    const to = findContainer(oId);
    if (!from || !to) return;
    setOverCol(to);
    if (from === to) return;
    const next = normalizeBoard(qc.getQueryData<TrackerBoard>(TRACKER_KEY) ?? board);
    const idx = next[from].findIndex((i) => String(i.id) === aId);
    if (idx < 0) return;
    const [moving] = next[from].splice(idx, 1);
    const overIdx = next[to].findIndex((i) => String(i.id) === oId);
    const insertAt = overIdx >= 0 ? overIdx : next[to].length;
    next[to].splice(insertAt, 0, { ...moving, status: to });
    qc.setQueryData<TrackerBoard>(TRACKER_KEY, { columns: next });
  };

  const reset = () => {
    setActiveId(null);
    setOverCol(null);
    lastDragEnd.current = Date.now();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const snap = snapshot.current;
    reset();
    if (!snap) return;
    const aId = String(active.id);
    if (!over) {
      qc.setQueryData(TRACKER_KEY, snap);
      return;
    }
    const current = normalizeBoard(qc.getQueryData<TrackerBoard>(TRACKER_KEY) ?? board);
    const container = findContainer(aId, current);
    const overContainer = findContainer(String(over.id), current);
    if (!container) return;
    if (overContainer === container) {
      const oldIdx = current[container].findIndex((i) => String(i.id) === aId);
      const newIdx = current[container].findIndex((i) => String(i.id) === String(over.id));
      if (newIdx >= 0 && oldIdx !== newIdx) {
        current[container] = arrayMove(current[container], oldIdx, newIdx);
        qc.setQueryData<TrackerBoard>(TRACKER_KEY, { columns: current });
      }
    }
    const origCols = normalizeBoard(snap);
    const origin = findContainer(aId, origCols);
    const origIdx = origin ? origCols[origin].findIndex((i) => String(i.id) === aId) : -1;
    const nowCols = normalizeBoard(qc.getQueryData<TrackerBoard>(TRACKER_KEY));
    const nowIdx = nowCols[container].findIndex((i) => String(i.id) === aId);
    if (origin === container && origIdx === nowIdx) return;
    void move(aId, container, { snapshot: snap, skipOptimistic: true });
  };

  const onDragCancel = () => {
    if (snapshot.current) qc.setQueryData(TRACKER_KEY, snapshot.current);
    reset();
  };

  const open = (i: TrackerItem) => {
    if (Date.now() - lastDragEnd.current < 250) return;
    onOpen(i);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {/* phones: one column ≈ 82% of the screen, swiped with snap; desktop: all six side by side */}
      <div className="-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4 pb-4 scrollbar-thin sm:-mx-6 sm:scroll-px-6 sm:px-6 md:snap-none">
        <div className="grid grid-cols-[repeat(6,82vw)] gap-2.5 sm:grid-cols-[repeat(6,minmax(250px,1fr))] xl:grid-cols-[repeat(6,minmax(196px,1fr))]">
          {STATUS_ORDER.map((s) => (
            <Column key={s} status={s} items={cols[s]} highlighted={!!activeId && overCol === s} onOpen={open} />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {activeItem ? <TrackerCardView item={activeItem} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
