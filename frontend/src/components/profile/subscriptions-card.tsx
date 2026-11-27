"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Inbox, Plus, Target, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import type { Subscription, VacancyFilters } from "@/lib/types";
import { cn, currencySign, FORMAT_LABEL, GRADE_LABEL, formatDate, plural, sourceMeta } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Input, Label, Skeleton, Switch } from "@/components/ui/primitives";

export function filterChips(f: VacancyFilters): string[] {
  const out: string[] = [];
  if (f.q) out.push(`«${f.q}»`);
  if (f.salary_min) out.push(`от ${f.salary_min.toLocaleString("ru-RU")} ${currencySign(f.currency ?? "RUB")}`);
  f.grade?.forEach((g) => out.push(GRADE_LABEL[g] ?? g));
  f.format?.forEach((x) => out.push(FORMAT_LABEL[x] ?? x));
  f.tags?.forEach((t) => out.push(t));
  f.source?.forEach((s) => out.push(sourceMeta(s).title));
  if (f.city) out.push(f.city);
  if (f.hide_ghost) out.push("без вечных");
  if (f.only_with_salary) out.push("с зарплатой");
  return out;
}

function readLastFilters(): VacancyFilters | null {
  try {
    const raw = localStorage.getItem("nja.lastFilters");
    if (!raw) return null;
    const f = JSON.parse(raw) as VacancyFilters;
    const rest = { ...f };
    delete rest.sort;
    return filterChips(rest).length ? rest : null;
  } catch {
    return null;
  }
}

function ModeToggle({ value, onChange }: { value: Subscription["mode"]; onChange: (v: Subscription["mode"]) => void }) {
  const opts = [
    ["instant", "Мгновенно", Zap],
    ["digest", "Дайджест", Inbox],
  ] as const;
  return (
    <div className="flex rounded-lg bg-muted p-0.5 ring-1 ring-inset ring-border">
      {opts.map(([k, label, Icon]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn("relative flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors", value === k ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {value === k && <motion.span layoutId="sub-mode" className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-inset ring-border" />}
          <Icon className="relative h-3.5 w-3.5" />
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Subscription["mode"]>("instant");
  const [minMatch, setMinMatch] = useState(70);
  const [useMatch, setUseMatch] = useState(true);
  const [filters, setFilters] = useState<VacancyFilters | null>(null);
  useEffect(() => setFilters(readLastFilters()), []);

  const m = useMutation({
    mutationFn: () => api.createSubscription({ name: name.trim() || "Моя подписка", filters: filters ?? {}, mode, min_match: useMatch ? minMatch : null }),
    onSuccess: () => {
      track("subscription_created");
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Подписка создана", { description: mode === "instant" ? "Новые вакансии придут в Telegram сразу" : "Дайджест — раз в день" });
      onDone();
    },
    onError: (e) => toast.error("Не удалось создать подписку", { description: (e as Error).message }),
  });

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <div className="mx-5 mb-4 space-y-4 rounded-xl bg-muted/40 p-4 ring-1 ring-inset ring-border">
        <div className="space-y-1.5">
          <Label htmlFor="sub-name">Название</Label>
          <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Python Senior удалёнка" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>Фильтры (из текущего поиска)</Label>
          {filters ? (
            <div className="flex flex-wrap gap-1.5">
              {filterChips(filters).map((c) => (
                <Badge key={c} tone="outline">
                  {c}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Будут использованы фильтры по умолчанию — настройте поиск на главной, чтобы сузить подписку.</p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Режим</Label>
            <ModeToggle value={mode} onChange={setMode} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="min-match">Минимальный match</Label>
              <Switch checked={useMatch} onCheckedChange={setUseMatch} />
            </div>
            <div className={cn("flex h-8 items-center gap-3 transition-opacity", !useMatch && "pointer-events-none opacity-40")}>
              <input
                id="min-match"
                type="range"
                min={0}
                max={100}
                step={5}
                value={minMatch}
                onChange={(e) => setMinMatch(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-[var(--primary)]"
              />
              <span className="w-10 text-right text-sm font-semibold tabular-nums">{minMatch}%</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Отмена
          </Button>
          <Button type="submit" size="sm" loading={m.isPending}>
            Создать подписку
          </Button>
        </div>
      </div>
    </motion.form>
  );
}

function SubRow({ s, index }: { s: Subscription; index: number }) {
  const qc = useQueryClient();
  const patch = useMutation({
    mutationFn: (active: boolean) => api.patchSubscription(s.id, { active }),
    onMutate: async (active) => {
      qc.setQueryData<Subscription[]>(["subscriptions"], (old) => old?.map((x) => (x.id === s.id ? { ...x, active } : x)));
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.error("Не удалось обновить", { description: (e as Error).message });
    },
  });
  const del = useMutation({
    mutationFn: () => api.deleteSubscription(s.id),
    onSuccess: () => {
      qc.setQueryData<Subscription[]>(["subscriptions"], (old) => old?.filter((x) => x.id !== s.id));
      toast("Подписка удалена");
    },
    onError: (e) => toast.error("Не удалось удалить", { description: (e as Error).message }),
  });
  const chips = filterChips(s.filters);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ delay: index * 0.04 }}
      className={cn("group flex items-start gap-3 px-5 py-4 transition-opacity", !s.active && "opacity-60")}
    >
      <div className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset", s.mode === "instant" ? "bg-violet-500/10 text-violet-500 ring-violet-500/25 dark:text-violet-300" : "bg-sky-500/10 text-sky-600 ring-sky-500/25 dark:text-sky-300")}>
        {s.mode === "instant" ? <Zap className="h-4 w-4" /> : <Inbox className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[14px] font-medium">{s.name}</span>
          <Badge tone={s.mode === "instant" ? "primary" : "info"}>{s.mode === "instant" ? "мгновенно" : "дайджест"}</Badge>
          {s.min_match != null && (
            <Badge tone="success">
              <Target className="h-3 w-3" />
              match ≥ {s.min_match}
            </Badge>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.length ? (
            chips.map((c) => (
              <span key={c} className="rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] text-muted-foreground ring-1 ring-inset ring-border">
                {c}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-muted-foreground">Все вакансии</span>
          )}
        </div>
        <div className="mt-2 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{s.matched_last_24h}</span> {plural(s.matched_last_24h, "совпадение", "совпадения", "совпадений")} за 24 ч · создана {formatDate(s.created_at)}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Switch checked={s.active} onCheckedChange={(v) => patch.mutate(v)} />
        <Button variant="ghost" size="icon-sm" onClick={() => del.mutate()} loading={del.isPending} aria-label="Удалить подписку" className="opacity-60 hover:text-rose-500 group-hover:opacity-100">
          {!del.isPending && <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </motion.li>
  );
}

export function SubscriptionsCard() {
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ["subscriptions"], queryFn: api.subscriptions });
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<Bell className="h-4 w-4" />}
        title="Подписки"
        description="Сохранённые поиски с уведомлениями в Telegram"
        action={
          !creating && (
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Новая
            </Button>
          )
        }
      />
      <div className="pt-4">
        <AnimatePresence>{creating && <CreateForm onDone={() => setCreating(false)} />}</AnimatePresence>
        {q.isLoading ? (
          <div className="space-y-3 border-t p-5">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : q.data && q.data.length ? (
          <ul className="divide-y border-t">
            <AnimatePresence initial={false}>
              {q.data.map((s, i) => (
                <SubRow key={s.id} s={s} index={i} />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          !creating && (
            <div className="border-t px-5 py-10 text-center">
              <Bell className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <div className="text-sm font-medium">Подписок пока нет</div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">Настройте фильтры на главной и сохраните их как подписку.</p>
            </div>
          )
        )}
      </div>
    </Card>
  );
}
