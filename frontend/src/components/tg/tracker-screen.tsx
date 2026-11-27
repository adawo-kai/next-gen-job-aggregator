"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bell, BellPlus, ChevronRight, KanbanSquare, NotebookPen, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { TrackerBoard, TrackerItem, TrackerStatus } from "@/lib/types";
import { cn, formatDate, STATUS_META, STATUS_ORDER, timeAgo } from "@/lib/utils";
import { K, useTracker } from "./data";
import { usePushScreen } from "./nav";
import { confirmDialog, haptic } from "./telegram";
import { Avatar, Button, Chip, Collapse, EmptyState, Section, Separator, Sheet, Skeleton } from "./ui";
import { SalaryLine } from "./vacancy-card";

/* ---------------- optimistic mutations ---------------- */

function mapItems(b: TrackerBoard, fn: (cols: TrackerBoard["columns"]) => TrackerBoard["columns"]): TrackerBoard {
  return { ...b, columns: fn(b.columns) };
}

function useTrackerMutations() {
  const qc = useQueryClient();
  const snapshot = async () => {
    await qc.cancelQueries({ queryKey: K.tracker });
    return qc.getQueryData<TrackerBoard>(K.tracker);
  };
  const revert = (prev?: TrackerBoard) => prev && qc.setQueryData(K.tracker, prev);
  const settle = () => qc.invalidateQueries({ queryKey: K.tracker });

  const move = useMutation({
    mutationFn: ({ item, to }: { item: TrackerItem; to: TrackerStatus }) => api.patchTracker(item.id, { status: to }),
    onMutate: async ({ item, to }) => {
      const prev = await snapshot();
      qc.setQueryData<TrackerBoard>(K.tracker, (b) =>
        b
          ? mapItems(b, (cols) => {
              const next = { ...cols } as TrackerBoard["columns"];
              for (const s of STATUS_ORDER) next[s] = (cols[s] ?? []).filter((i) => i.id !== item.id);
              next[to] = [{ ...item, status: to, updated_at: new Date().toISOString() }, ...(next[to] ?? [])];
              return next;
            })
          : b,
      );
      haptic.impact("medium");
      return { prev };
    },
    onError: (e, { item, to }, ctx) => {
      revert(ctx?.prev);
      haptic.notify("error");
      if (e instanceof ApiError && e.status === 422) toast.error(`Нельзя перевести из «${STATUS_META[item.status].title}» в «${STATUS_META[to].title}»`);
      else toast.error("Не удалось изменить статус", { description: (e as Error).message });
    },
    onSuccess: (_d, { to }) => {
      haptic.notify("success");
      toast.success(`Статус: ${STATUS_META[to].title}`, to === "applied" ? { description: "Напомним написать HR через 3 дня" } : undefined);
    },
    onSettled: settle,
  });

  const note = useMutation({
    mutationFn: ({ item, text }: { item: TrackerItem; text: string }) => api.patchTracker(item.id, { note: text }),
    onMutate: async ({ item, text }) => {
      const prev = await snapshot();
      qc.setQueryData<TrackerBoard>(K.tracker, (b) =>
        b ? mapItems(b, (cols) => Object.fromEntries(Object.entries(cols).map(([s, list]) => [s, list.map((i) => (i.id === item.id ? { ...i, note: text } : i))])) as TrackerBoard["columns"]) : b,
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      revert(ctx?.prev);
      toast.error("Заметка не сохранилась", { description: (e as Error).message });
    },
    onSuccess: () => {
      haptic.notify("success");
      toast.success("Заметка сохранена");
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (item: TrackerItem) => api.deleteTracker(item.id),
    onMutate: async (item) => {
      const prev = await snapshot();
      qc.setQueryData<TrackerBoard>(K.tracker, (b) =>
        b ? mapItems(b, (cols) => Object.fromEntries(Object.entries(cols).map(([s, list]) => [s, list.filter((i) => i.id !== item.id)])) as TrackerBoard["columns"]) : b,
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      revert(ctx?.prev);
      toast.error("Не удалось удалить", { description: (e as Error).message });
    },
    onSuccess: () => {
      haptic.notify("success");
      toast("Удалено из трекера");
    },
    onSettled: settle,
  });

  const remind = useMutation({
    mutationFn: ({ item, at, text }: { item: TrackerItem; at: Date; text: string }) => api.addReminder(item.id, at.toISOString(), text),
    onSuccess: (r, { item }) => {
      haptic.notify("success");
      qc.setQueryData<TrackerBoard>(K.tracker, (b) =>
        b
          ? mapItems(b, (cols) => Object.fromEntries(Object.entries(cols).map(([s, list]) => [s, list.map((i) => (i.id === item.id ? { ...i, reminders: [...i.reminders, r] } : i))])) as TrackerBoard["columns"])
          : b,
      );
      toast.success("Напоминание создано", { description: `Бот напишет ${formatDate(r.remind_at, true)}` });
    },
    onError: (e) => {
      haptic.notify("error");
      toast.error("Не удалось создать напоминание", { description: (e as Error).message });
    },
    onSettled: settle,
  });

  return { move, note, remove, remind };
}

/* ---------------- helpers ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function inDays(days: number) {
  const d = new Date(Date.now() + days * 86400_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

const QUICK_REMIND = [
  { label: "Через 1 день", days: 1 },
  { label: "Через 3 дня", days: 3 },
  { label: "Через неделю", days: 7 },
];

function nextReminder(i: TrackerItem) {
  const now = Date.now();
  return i.reminders.filter((r) => !r.sent && new Date(r.remind_at).getTime() > now).sort((a, b) => +new Date(a.remind_at) - +new Date(b.remind_at))[0] ?? null;
}

/* ---------------- item sheet ---------------- */

function ItemSheet({ item: selected, transitions, onClose, onOpenVacancy, mut }: { item: TrackerItem | null; transitions: Record<TrackerStatus, TrackerStatus[]>; onClose: () => void; onOpenVacancy: (i: TrackerItem) => void; mut: ReturnType<typeof useTrackerMutations> }) {
  // keep rendering the last item while the sheet slides out
  const last = useRef<TrackerItem | null>(selected);
  if (selected) last.current = selected;
  const item = selected ?? last.current;
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [text, setText] = useState("");
  const lastId = useRef<TrackerItem["id"] | null>(null);
  useEffect(() => {
    if (selected && selected.id !== lastId.current) {
      lastId.current = selected.id;
      setNote(selected.note ?? "");
      setWhen("");
      setText("");
    }
    if (!selected) lastId.current = null;
  }, [selected]);

  const open = !!selected;
  const next = item ? transitions[item.status] ?? [] : [];
  const pending = item ? item.reminders.filter((r) => !r.sent).sort((a, b) => +new Date(a.remind_at) - +new Date(b.remind_at)) : [];
  const noteDirty = !!item && note.trim() !== (item.note ?? "").trim();
  const whenDate = when ? new Date(when) : null;
  const whenValid = !!whenDate && !Number.isNaN(whenDate.getTime()) && whenDate.getTime() > Date.now();

  return (
    <Sheet open={open} onClose={onClose}>
      {item && (
        <div>
          <button type="button" onClick={() => onOpenVacancy(item)} className="tg-press flex w-full items-center gap-3 rounded-[14px] bg-card p-3.5 text-left">
            <Avatar src={item.vacancy.company.logo_url} name={item.vacancy.company.name} size={44} rounded="xl" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-[16px] font-semibold leading-tight">{item.vacancy.title}</span>
              <span className="mt-0.5 block truncate text-[14px] text-muted-foreground">{item.vacancy.company.name}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>

          <Section
            title="Статус"
            className="mt-4"
            footer={next.length ? undefined : "С этого этапа переходов нет"}
          >
            <div className="flex items-center gap-2.5 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[item.status].color }} />
              <span className="text-[16px] font-semibold">{STATUS_META[item.status].title}</span>
              <span className="ml-auto text-[13px] text-muted-foreground">{timeAgo(item.updated_at)}</span>
            </div>
            {next.length > 0 && (
              <>
                <Separator />
                <div className="px-4 pb-3.5 pt-3">
                  <div className="mb-2 text-[13px] text-muted-foreground">Перевести в</div>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_ORDER.filter((s) => next.includes(s)).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => mut.move.mutate({ item, to: s })}
                        className="tg-press inline-flex h-10 items-center gap-2 rounded-full bg-muted px-3.5 text-[15px] font-medium"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[s].color }} />
                        {STATUS_META[s].title}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </Section>

          <Section title="Заметка" className="mt-4">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Контакт HR, вопросы с интервью, вилка…"
              rows={3}
              maxLength={2000}
              className="block w-full resize-none bg-transparent px-4 py-3 text-[16px] leading-snug outline-none placeholder:text-muted-foreground"
            />
            <Collapse open={noteDirty}>
              {(
                <div>
                  <div className="flex justify-end gap-2 px-3 pb-3">
                    <Button variant="plain" className="h-10" onClick={() => setNote(item.note ?? "")}>
                      Отмена
                    </Button>
                    <Button className="h-10" loading={mut.note.isPending} onClick={() => mut.note.mutate({ item, text: note.trim() })}>
                      Сохранить
                    </Button>
                  </div>
                </div>
              )}
            </Collapse>
          </Section>

          <Section title="Напоминания" className="mt-4" footer="Бот пришлёт напоминание в Telegram в указанное время">
            {pending.map((r) => (
              <div key={r.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <Bell className="h-[18px] w-[18px] shrink-0 text-[var(--tg-link)]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{r.text}</div>
                    <div className="text-[13px] text-muted-foreground">{formatDate(r.remind_at, true)}</div>
                  </div>
                </div>
                <Separator inset={46} />
              </div>
            ))}
            <div className="px-4 pb-3.5 pt-3">
              <div className="tg-scroll-x -mx-4 flex gap-2 px-4 py-[5px]">
                {QUICK_REMIND.map((qr) => {
                  const v = toLocalInput(inDays(qr.days));
                  return (
                    <Chip key={qr.days} active={when === v} onClick={() => setWhen(v)} className={when === v ? undefined : "bg-muted"}>
                      {qr.label}
                    </Chip>
                  );
                })}
              </div>
              <input
                type="datetime-local"
                value={when}
                min={toLocalInput(new Date())}
                onChange={(e) => setWhen(e.target.value)}
                aria-label="Дата и время напоминания"
                className="mt-2 h-11 w-full rounded-xl bg-muted px-3 text-[16px] outline-none"
              />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Написать HR, если нет ответа"
                maxLength={200}
                className="mt-2 h-11 w-full rounded-xl bg-muted px-3 text-[16px] outline-none placeholder:text-muted-foreground"
              />
              <Button
                variant="tinted"
                className="mt-2.5 w-full"
                disabled={!whenValid}
                loading={mut.remind.isPending}
                onClick={() =>
                  whenDate &&
                  mut.remind.mutate(
                    { item, at: whenDate, text: text.trim() || "Написать HR, если нет ответа" },
                    {
                      onSuccess: () => {
                        setWhen("");
                        setText("");
                      },
                    },
                  )
                }
              >
                <BellPlus className="h-[18px] w-[18px]" /> Напомнить
              </Button>
            </div>
          </Section>

          <div className="mt-4 overflow-hidden rounded-[14px] bg-card">
            <button type="button" onClick={() => onOpenVacancy(item)} className="tg-press flex h-[52px] w-full items-center gap-3 px-4 text-[16px]">
              <NotebookPen className="h-5 w-5 text-[var(--tg-link)]" /> Открыть вакансию
            </button>
            <Separator inset={52} />
            <button
              type="button"
              onClick={async () => {
                if (await confirmDialog("Удалить вакансию из трекера? Заметки и напоминания тоже удалятся.")) {
                  onClose();
                  mut.remove.mutate(item);
                }
              }}
              className="tg-press flex h-[52px] w-full items-center gap-3 px-4 text-[16px] text-[var(--tg-destructive)]"
            >
              <Trash2 className="h-5 w-5" /> Удалить из трекера
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- list ---------------- */

function ItemCard({ item, onOpen }: { item: TrackerItem; onOpen: (i: TrackerItem) => void }) {
  const r = nextReminder(item);
  return (
    <button type="button" onClick={() => onOpen(item)} className="tg-press block w-full rounded-[14px] bg-card p-3.5 text-left">
      <div className="flex gap-3">
        <Avatar src={item.vacancy.company.logo_url} name={item.vacancy.company.name} size={40} rounded="xl" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[16px] font-semibold leading-tight">{item.vacancy.title}</div>
          <div className="mt-0.5 truncate text-[14px] text-muted-foreground">{item.vacancy.company.name}</div>
        </div>
        <ChevronRight className="mt-2.5 h-5 w-5 shrink-0 text-muted-foreground/70" />
      </div>
      <SalaryLine salary={item.vacancy.salary} className="mt-2 [&>span:first-child]:text-[15px]" />
      {item.note && <div className="mt-1.5 line-clamp-2 text-[14px] leading-snug text-foreground/80">{item.note}</div>}
      <div className="mt-2 flex items-center gap-3 text-[13px] text-muted-foreground">
        <span>Обновлено {timeAgo(item.updated_at)}</span>
        {r && (
          <span className="inline-flex min-w-0 items-center gap-1 text-[var(--tg-link)]">
            <Bell className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formatDate(r.remind_at, true)}</span>
          </span>
        )}
      </div>
    </button>
  );
}

export function TrackerScreen() {
  const params = useSearchParams();
  const push = usePushScreen();
  const board = useTracker();
  const mut = useTrackerMutations();
  const [tab, setTab] = useState<TrackerStatus>("saved");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deepLinked = useRef(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const cols = board.data?.columns;
  const all = useMemo(() => (cols ? STATUS_ORDER.flatMap((s) => cols[s]) : []), [cols]);
  const selected = selectedId ? all.find((i) => String(i.id) === selectedId) ?? null : null;

  // /tg/tracker?item=<id> (from a vacancy's MainButton): open that card on its status tab
  useEffect(() => {
    if (deepLinked.current || !cols) return;
    const id = params.get("item");
    deepLinked.current = true;
    const it = id ? all.find((i) => String(i.id) === id) : null;
    if (it) {
      setTab(it.status);
      setSelectedId(String(it.id));
    } else {
      const first = STATUS_ORDER.find((s) => cols[s].length);
      if (first) setTab(first);
    }
  }, [cols, all, params]);

  // keep the active tab chip in view
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [tab]);

  const list = cols?.[tab] ?? [];

  return (
    <div>
      <header className="px-1 pb-2 pt-1">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Трекер</h1>
        <p className="text-[15px] text-muted-foreground">
          {board.isPending ? "Загружаем…" : all.length ? `${all.length} в работе · ${cols!.interview.length + cols!.test_task.length} на этапе отбора` : "Отклики от «сохранил» до оффера"}
        </p>
      </header>

      <div className="sticky z-30 -mx-3 bg-background px-3 py-1.5" style={{ top: "var(--tg-content-top)" }}>
        <div ref={tabsRef} className="tg-scroll-x -mx-3 flex gap-2 px-3 py-[5px]" role="tablist">
          {STATUS_ORDER.map((s) => {
            const n = cols?.[s].length ?? 0;
            const active = tab === s;
            return (
              <Chip key={s} data-tab={s} role="tab" aria-selected={active} active={active} onClick={() => setTab(s)}>
                {!active && <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[s].color }} />}
                {STATUS_META[s].title}
                <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{board.isPending ? "·" : n}</span>
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="mt-2 space-y-2.5">
        {board.isPending ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-[118px] w-full rounded-[14px]" />)
        ) : board.isError ? (
          <EmptyState
            icon={<KanbanSquare className="h-7 w-7" />}
            title="Не удалось загрузить трекер"
            text={(board.error as Error).message}
            action={
              <Button variant="tinted" onClick={() => board.refetch()}>
                Повторить
              </Button>
            }
          />
        ) : all.length === 0 ? (
          <EmptyState
            icon={<KanbanSquare className="h-7 w-7" />}
            title="Пока пусто"
            text="Откройте вакансию и нажмите «В трекер» — она появится здесь, а бот напомнит о следующем шаге."
            action={
              <Button variant="tinted" onClick={() => push("/tg")}>
                К вакансиям
              </Button>
            }
          />
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-[15px] text-muted-foreground">В «{STATUS_META[tab].title}» пока ничего нет</div>
        ) : (
          <>
            {list.map((i) => (
              <div key={`${tab}-${i.id}`} className="tg-fade-up">
                <ItemCard item={i} onOpen={(x) => { haptic.impact("light"); setSelectedId(String(x.id)); }} />
              </div>
            ))}
          </>
        )}
      </div>

      <ItemSheet
        item={selected}
        transitions={board.data?.transitions ?? ({} as Record<TrackerStatus, TrackerStatus[]>)}
        onClose={() => setSelectedId(null)}
        onOpenVacancy={(i) => {
          setSelectedId(null);
          push(`/tg/v/${i.vacancy.id}`);
        }}
        mut={mut}
      />
    </div>
  );
}
