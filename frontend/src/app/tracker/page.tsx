"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Briefcase, KanbanSquare, LogIn, MousePointer2, Sparkles, Trophy, Workflow } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TrackerItem, TrackerStatus } from "@/lib/types";
import { cn, STATUS_ORDER } from "@/lib/utils";
import { Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { KanbanBoard, normalizeBoard, TRACKER_KEY, useMoveItem } from "@/components/tracker/board";
import { ItemDrawer } from "@/components/tracker/item-drawer";

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5">
      <span className={cn("grid h-8 w-8 place-items-center rounded-lg bg-muted ring-1 ring-inset ring-border", tone)}>{icon}</span>
      <div className="leading-tight">
        <div className="text-[17px] font-semibold tabular-nums tracking-tight">{value}</div>
        <div className="text-[11.5px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="-mx-4 overflow-x-hidden px-4 sm:-mx-6 sm:px-6">
      <div className="grid grid-cols-[repeat(6,minmax(250px,1fr))] gap-2.5 xl:grid-cols-[repeat(6,minmax(196px,1fr))]">
        {STATUS_ORDER.map((s, i) => (
          <div key={s} className="min-h-[420px] rounded-2xl border bg-muted/30 p-2">
            <div className="flex items-center gap-2 px-1 py-1.5">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="mt-1 space-y-2">
              {Array.from({ length: Math.max(1, 3 - (i % 3)) }).map((_, k) => (
                <div key={k} className="space-y-2 rounded-xl border bg-card p-3">
                  <div className="flex gap-2.5">
                    <Skeleton className="h-[30px] w-[30px] rounded-xl" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-3.5 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrackerPage() {
  const { isAuthed } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const move = useMoveItem();

  const q = useQuery({ queryKey: TRACKER_KEY, queryFn: api.tracker, enabled: mounted && isAuthed });
  const cols = normalizeBoard(q.data);
  const all = STATUS_ORDER.flatMap((s) => cols[s]);
  const selected = selectedId ? all.find((i) => String(i.id) === selectedId) ?? null : null;
  const inProgress = cols.applied.length + cols.test_task.length + cols.interview.length;

  const onStatusChange = (item: TrackerItem, to: TrackerStatus) => void move(String(item.id), to);

  if (mounted && !isAuthed) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <EmptyState
          icon={<KanbanSquare className="h-5 w-5" />}
          title="Трекер откликов доступен после входа"
          description="Сохраняйте вакансии, двигайте их по этапам от отклика до оффера, ставьте напоминания — бот пришлёт их в Telegram."
          action={
            <div className="flex gap-2">
              <Link href="/login">
                <Button>
                  <LogIn className="h-4 w-4" /> Войти
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="secondary">Создать аккаунт</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary ring-1 ring-inset ring-primary/25">
            <Workflow className="h-3 w-3" /> Канбан откликов
          </div>
          <h1 className="text-gradient text-[28px] font-semibold tracking-tight sm:text-[32px]">Трекер откликов</h1>
          <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-muted-foreground">
            <MousePointer2 className="h-3.5 w-3.5" />
            Перетаскивайте карточки между этапами. Нажмите на карточку, чтобы открыть заметки, напоминания и историю.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <Stat icon={<Briefcase className="h-4 w-4" />} label="Всего" value={q.isLoading ? "—" : all.length} />
          <Stat icon={<Sparkles className="h-4 w-4" />} label="В процессе" value={q.isLoading ? "—" : inProgress} tone="text-sky-500 dark:text-sky-300" />
          <Stat icon={<Trophy className="h-4 w-4" />} label="Офферы" value={q.isLoading ? "—" : cols.offer.length} tone="text-emerald-500 dark:text-emerald-400" />
        </div>
      </motion.div>

      {!mounted || q.isLoading ? (
        <BoardSkeleton />
      ) : q.isError ? (
        <EmptyState
          icon={<KanbanSquare className="h-5 w-5" />}
          title="Не удалось загрузить трекер"
          description={(q.error as Error).message}
          action={<Button onClick={() => q.refetch()}>Повторить</Button>}
        />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<KanbanSquare className="h-5 w-5" />}
          title="Пока пусто"
          description="Добавьте вакансию в трекер кнопкой «В трекер» в ленте — она появится в колонке «Сохранено»."
          action={
            <Link href="/">
              <Button>К вакансиям</Button>
            </Link>
          }
        />
      ) : (
        <KanbanBoard board={q.data!} onOpen={(i) => setSelectedId(String(i.id))} />
      )}

      <ItemDrawer item={selected} open={!!selected} onOpenChange={(v) => !v && setSelectedId(null)} onStatusChange={onStatusChange} />
    </div>
  );
}
