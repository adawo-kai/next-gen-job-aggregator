"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowUpRight,
  BellPlus,
  BellRing,
  CheckCircle2,
  CircleDot,
  History,
  MapPin,
  StickyNote,
  Send,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TrackerBoard, TrackerEvent, TrackerItem, TrackerStatus } from "@/lib/types";
import { cn, FORMAT_LABEL, formatDate, STATUS_META, STATUS_ORDER, timeAgo } from "@/lib/utils";
import { Button, Input, Label, Skeleton, Textarea, Tooltip } from "@/components/ui/primitives";
import { useTelegramLink } from "@/components/profile/telegram-card";
import { canMove, transitionHint } from "./board";
import { CompanyAvatar, GhostBadge, MatchRing, SalaryText, SourceStack } from "@/components/vacancy/bits";
import { GradeBadge } from "@/components/vacancy/vacancy-card";

function statusTitle(s: unknown) {
  return typeof s === "string" && s in STATUS_META ? STATUS_META[s as TrackerStatus].title : null;
}

function defaultReminderValue() {
  const d = new Date(Date.now() + 2 * 86400_000);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventRow({ e, last }: { e: TrackerEvent; last: boolean }) {
  const p = e.payload ?? {};
  let icon = <CircleDot className="h-3.5 w-3.5" />;
  let tone = "text-muted-foreground bg-muted ring-border";
  let body: React.ReactNode = null;
  if (e.kind === "status") {
    const to = typeof p.to === "string" ? (p.to as TrackerStatus) : null;
    const from = statusTitle(p.from);
    icon = <CheckCircle2 className="h-3.5 w-3.5" />;
    tone = "text-sky-500 dark:text-sky-300 bg-sky-500/10 ring-sky-500/25";
    body = (
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        {from ? (
          <>
            <span className="text-muted-foreground">{from}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          </>
        ) : (
          <span className="text-muted-foreground">Добавлено в</span>
        )}
        {to && (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[to]?.dot)} />
            {statusTitle(to) ?? String(p.to)}
          </span>
        )}
      </div>
    );
  } else if (e.kind === "note") {
    icon = <StickyNote className="h-3.5 w-3.5" />;
    tone = "text-violet-500 dark:text-violet-300 bg-violet-500/10 ring-violet-500/25";
    body = (
      <div className="text-[13px]">
        <span className="text-muted-foreground">Заметка: </span>
        <span className="line-clamp-3">{String(p.text ?? "")}</span>
      </div>
    );
  } else if (e.kind === "reminder") {
    icon = <BellRing className="h-3.5 w-3.5" />;
    tone = "text-amber-500 dark:text-amber-300 bg-amber-500/10 ring-amber-500/25";
    body = (
      <div className="text-[13px]">
        <span className="text-muted-foreground">{p.auto ? "Авто-напоминание" : "Напоминание"}: </span>
        {String(p.text ?? "")}
        {typeof p.remind_at === "string" && <span className="text-muted-foreground"> · {formatDate(p.remind_at, true)}</span>}
      </div>
    );
  }
  return (
    <li className="relative flex gap-3 pb-4">
      {!last && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />}
      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 ring-inset", tone)}>{icon}</span>
      <div className="min-w-0 flex-1 pt-1">
        {body}
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">{timeAgo(e.created_at)}</div>
      </div>
    </li>
  );
}

export function ItemDrawer({
  item,
  open,
  onOpenChange,
  onStatusChange,
  board,
}: {
  item: TrackerItem | null;
  /** for the allowed-transitions table */
  board?: TrackerBoard;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStatusChange: (item: TrackerItem, to: TrackerStatus) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const tgLinked = !!user?.telegram_linked;
  const tgLink = useTelegramLink();
  const [note, setNote] = useState("");
  const [remAt, setRemAt] = useState(defaultReminderValue);
  const [remText, setRemText] = useState("");
  const itemId = item?.id;

  useEffect(() => {
    setNote(item?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const events = useQuery({
    queryKey: ["tracker-events", itemId],
    queryFn: () => api.trackerEvents(itemId!),
    enabled: open && itemId != null,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tracker"] });
    qc.invalidateQueries({ queryKey: ["tracker-events", itemId] });
  };

  const saveNote = useMutation({
    mutationFn: () => api.patchTracker(itemId!, { note }),
    onSuccess: () => {
      toast.success("Заметка сохранена");
      refresh();
    },
    onError: (e) => toast.error("Не удалось сохранить заметку", { description: (e as Error).message }),
  });

  const addReminder = useMutation({
    mutationFn: () => {
      const d = new Date(remAt);
      if (Number.isNaN(d.getTime())) throw new Error("Укажите дату и время");
      return api.addReminder(itemId!, d.toISOString(), remText.trim() || "Напоминание по вакансии");
    },
    onSuccess: (r) => {
      toast.success("Напоминание создано", {
        description: tgLinked
          ? `${formatDate(r.remind_at, true)} — придёт в Telegram`
          : `${formatDate(r.remind_at, true)} · чтобы его получить, привяжите Telegram-бота`,
      });
      setRemText("");
      setRemAt(defaultReminderValue());
      refresh();
    },
    onError: (e) => toast.error("Не удалось создать напоминание", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: () => api.deleteTracker(itemId!),
    onSuccess: () => {
      toast.success("Удалено из трекера");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["tracker"] });
    },
    onError: (e) => toast.error("Не удалось удалить", { description: (e as Error).message }),
  });

  const v = item?.vacancy;
  const reminders = [...(item?.reminders ?? [])].sort((a, b) => +new Date(a.remind_at) - +new Date(b.remind_at));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && item && v && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.aside
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l bg-elevated shadow-2xl shadow-black/50 outline-none"
                initial={{ x: "100%", opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "100%", opacity: 0.6 }}
                transition={{ type: "spring", stiffness: 380, damping: 38 }}
              >
                {/* header */}
                <div className="relative overflow-hidden border-b px-5 pb-5 pt-5">
                  <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
                  <div className="flex items-start gap-3">
                    <CompanyAvatar name={v.company.name} logo={v.company.logo_url} size={44} />
                    <div className="min-w-0 flex-1">
                      <Dialog.Title className="text-[16px] font-semibold leading-snug tracking-tight">{v.title}</Dialog.Title>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">{v.company.name}</span>
                        {v.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {v.city}
                          </span>
                        )}
                        {v.format && <span>{FORMAT_LABEL[v.format]}</span>}
                      </div>
                    </div>
                    {v.match_score != null && <MatchRing score={v.match_score} size={46} />}
                    <Dialog.Close asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Закрыть">
                        <X className="h-4 w-4" />
                      </Button>
                    </Dialog.Close>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <SalaryText salary={v.salary} className="text-[14px]" />
                    <GradeBadge grade={v.grade} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <SourceStack sources={v.sources} />
                      {v.is_ghost && <GhostBadge reason={v.ghost_reason} repostCount={v.repost_count} />}
                    </div>
                    <Link
                      href={`/vacancies/${v.id}`}
                      className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline"
                      onClick={() => onOpenChange(false)}
                    >
                      Открыть вакансию <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 scrollbar-thin">
                  {/* status */}
                  <section>
                    <Label id="tracker-status-label">Статус</Label>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-labelledby="tracker-status-label" aria-describedby="tracker-status-hint">
                      {STATUS_ORDER.map((s) => {
                        const current = s === item.status;
                        const allowed = current || canMove(board, item.status, s);
                        const btn = (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={current}
                            aria-disabled={!allowed || undefined}
                            onClick={() => !current && allowed && onStatusChange(item, s)}
                            className={cn(
                              "flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium ring-1 ring-inset transition-all",
                              current
                                ? "cursor-default bg-muted text-foreground ring-border-strong shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_10%,transparent)]"
                                : allowed
                                  ? "cursor-pointer text-muted-foreground ring-border hover:text-foreground hover:ring-border-strong"
                                  : "cursor-not-allowed text-muted-foreground/60 ring-border/60",
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_META[s].dot, !allowed && "opacity-40")} />
                            {STATUS_META[s].title}
                          </button>
                        );
                        return allowed ? (
                          btn
                        ) : (
                          <Tooltip key={s} content={transitionHint(board, item.status)}>
                            {btn}
                          </Tooltip>
                        );
                      })}
                    </div>
                    <p id="tracker-status-hint" className="mt-2 text-[12px] text-muted-foreground">
                      {transitionHint(board, item.status)}
                    </p>
                  </section>

                  {/* note */}
                  <section>
                    <Label htmlFor="tracker-note">Заметки</Label>
                    <Textarea
                      id="tracker-note"
                      className="mt-2 min-h-[96px] resize-y"
                      placeholder="Контакты HR, вопросы к собеседованию, впечатления…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="secondary" loading={saveNote.isPending} disabled={note === (item.note ?? "")} onClick={() => saveNote.mutate()}>
                        Сохранить заметку
                      </Button>
                    </div>
                  </section>

                  {/* reminders */}
                  <section>
                    <Label>Напоминания</Label>
                    <div className="mt-2 space-y-1.5">
                      {reminders.length === 0 && <div className="text-[12.5px] text-muted-foreground">Напоминаний пока нет</div>}
                      {reminders.map((r) => (
                        <div key={r.id} className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2">
                          <BellRing className={cn("h-3.5 w-3.5 shrink-0", r.sent ? "text-muted-foreground" : "text-amber-500 dark:text-amber-300")} />
                          <div className="min-w-0 flex-1">
                            <div className={cn("truncate text-[13px]", r.sent && "text-muted-foreground line-through")}>{r.text}</div>
                            <div className="text-[11.5px] text-muted-foreground">{formatDate(r.remind_at, true)}</div>
                          </div>
                          {r.sent && <span className="text-[11px] text-muted-foreground">отправлено</span>}
                        </div>
                      ))}
                    </div>
                    {!tgLinked && (
                      <div className="mt-3 flex flex-col gap-2.5 rounded-xl bg-amber-500/[0.08] p-3 ring-1 ring-inset ring-amber-500/25 sm:flex-row sm:items-center">
                        <TriangleAlert className="hidden h-4 w-4 shrink-0 text-amber-600 sm:block dark:text-amber-300" />
                        <p className="flex-1 text-[12.5px] leading-snug text-amber-800 dark:text-amber-200">
                          Напоминание придёт только в Telegram — привяжите бота
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          loading={tgLink.isPending}
                          onClick={() => tgLink.mutate()}
                          className="shrink-0 bg-[#229ED9] text-white shadow-none hover:bg-[#1E8FC4]"
                        >
                          {!tgLink.isPending && <Send className="h-3.5 w-3.5" />}
                          Привязать Telegram
                        </Button>
                      </div>
                    )}
                    <form
                      className="mt-3 rounded-xl border border-dashed p-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        addReminder.mutate();
                      }}
                    >
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input aria-label="Текст напоминания" placeholder="Например: написать HR" value={remText} onChange={(e) => setRemText(e.target.value)} />
                        <Input aria-label="Дата и время напоминания" type="datetime-local" value={remAt} onChange={(e) => setRemAt(e.target.value)} className="sm:w-[200px]" required />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11.5px] text-muted-foreground">{tgLinked ? "Придёт в Telegram-бот" : "Telegram не привязан"}</span>
                        <Button size="sm" type="submit" loading={addReminder.isPending}>
                          {!addReminder.isPending && <BellPlus className="h-4 w-4" />}
                          Напомнить
                        </Button>
                      </div>
                    </form>
                  </section>

                  {/* timeline */}
                  <section>
                    <div className="flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label>История</Label>
                    </div>
                    <ul className="mt-3">
                      {events.isLoading &&
                        [0, 1, 2].map((i) => (
                          <li key={i} className="flex gap-3 pb-4">
                            <Skeleton className="h-7 w-7 rounded-full" />
                            <div className="flex-1 space-y-1.5 pt-1">
                              <Skeleton className="h-3 w-2/3" />
                              <Skeleton className="h-2.5 w-20" />
                            </div>
                          </li>
                        ))}
                      {events.data?.length === 0 && <li className="text-[12.5px] text-muted-foreground">Событий пока нет</li>}
                      {events.data?.map((e, i) => (
                        <EventRow key={e.id} e={e} last={i === events.data!.length - 1} />
                      ))}
                    </ul>
                  </section>
                </div>

                <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
                  <span className="text-[11.5px] text-muted-foreground">Обновлено {timeAgo(item.updated_at)}</span>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={del.isPending}
                    onClick={() => {
                      if (window.confirm("Удалить вакансию из трекера? История и напоминания тоже удалятся.")) del.mutate();
                    }}
                  >
                    {!del.isPending && <Trash2 className="h-4 w-4" />}
                    Удалить
                  </Button>
                </div>
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
