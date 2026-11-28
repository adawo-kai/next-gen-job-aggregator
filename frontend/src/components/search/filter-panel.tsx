"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellPlus, Check, ChevronDown, Ghost, RotateCcw, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import type { Currency, Format, Grade, VacancyFilters } from "@/lib/types";
import { cn, currencySign, FORMAT_LABEL, GRADE_LABEL, sourceMeta } from "@/lib/utils";
import { Button, Chip, Input, Select, Skeleton, Switch } from "@/components/ui/primitives";

const GRADES: Grade[] = ["intern", "junior", "middle", "senior", "lead"];
const FORMATS: Format[] = ["remote", "hybrid", "office"];
const CURRENCIES: Currency[] = ["RUB", "USD", "EUR", "KZT", "KGS"];
/** quick "salary from" presets, per currency (monthly) */
const SALARY_PRESETS: Record<Currency, number[]> = {
  RUB: [150000, 250000, 350000, 500000],
  USD: [2000, 4000, 6000],
  EUR: [2000, 4000, 6000],
  KZT: [500000, 1000000, 1500000],
  KGS: [50000, 100000, 150000, 250000],
};
const presetLabel = (v: number) => (v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1000}k`);

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr ?? [];
  return a.includes(v) ? a.filter((x) => x !== v) : [...a, v];
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b py-4 last:border-b-0">
      <button onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center justify-between text-[12px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        {title}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function activeFilterCount(f: VacancyFilters) {
  return (
    (f.salary_min ? 1 : 0) +
    (f.grade?.length ?? 0) +
    (f.format?.length ?? 0) +
    (f.tags?.length ?? 0) +
    (f.source?.length ?? 0) +
    (f.city ? 1 : 0) +
    (f.hide_ghost ? 1 : 0) +
    (f.only_with_salary ? 1 : 0)
  );
}

/** «Python · Senior · Удалёнка» — a readable auto name for a saved search. */
export function subscriptionName(f: VacancyFilters): string {
  const parts = [
    f.q?.trim(),
    ...(f.tags ?? []).slice(0, 2),
    ...(f.grade ?? []).map((g) => GRADE_LABEL[g]),
    ...(f.format ?? []).map((x) => FORMAT_LABEL[x]),
    f.city,
    f.salary_min ? `от ${f.salary_min.toLocaleString("ru-RU")} ${currencySign(f.currency ?? "RUB")}` : undefined,
  ].filter(Boolean) as string[];
  let name = "";
  for (const p of parts) {
    const next = name ? `${name} · ${p}` : p;
    if (next.length > 60) break;
    name = next;
  }
  return name || "Мой поиск";
}

function SaveAsSubscription({ filters }: { filters: VacancyFilters }) {
  const { isAuthed } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => {
      const rest: VacancyFilters = { ...filters, q: filters.q?.trim() || undefined };
      delete rest.sort;
      if (!rest.salary_min) delete rest.currency;
      return api.createSubscription({ name: subscriptionName(filters), filters: rest, mode: "instant", min_match: null });
    },
    onSuccess: (s) => {
      track("subscription_created");
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success(`Подписка «${s.name}» сохранена`, {
        description: "Новые вакансии по этому поиску придут в Telegram. Настроить — в профиле",
        action: { label: "В профиль", onClick: () => router.push("/profile#subscriptions") },
      });
    },
    onError: (e) => toast.error("Не удалось сохранить подписку", { description: (e as Error).message }),
  });
  const active = !!filters.q?.trim() || activeFilterCount(filters) > 0;
  if (!isAuthed || !active) return null;
  return (
    <Button type="button" variant="secondary" size="sm" className="mt-3 w-full" loading={m.isPending} onClick={() => m.mutate()}>
      {!m.isPending && <BellPlus className="h-3.5 w-3.5" />}
      Сохранить поиск как подписку
    </Button>
  );
}

export function FilterPanel({ filters, onChange }: { filters: VacancyFilters; onChange: (f: VacancyFilters) => void }) {
  const meta = useQuery({ queryKey: ["meta"], queryFn: api.meta, staleTime: 5 * 60_000 });
  const [showAllTags, setShowAllTags] = useState(false);
  const set = (patch: Partial<VacancyFilters>) => onChange({ ...filters, ...patch });
  const count = activeFilterCount(filters);
  const tags = meta.data?.top_tags ?? [];
  const visibleTags = showAllTags ? tags : tags.slice(0, 14);

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between pb-1">
        <span className="text-[13px] font-semibold">Фильтры{count > 0 && <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">{count}</span>}</span>
        {count > 0 && (
          <button
            onClick={() => onChange({ q: filters.q, sort: filters.sort, currency: filters.currency })}
            className="inline-flex cursor-pointer items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Сбросить
          </button>
        )}
      </div>
      <SaveAsSubscription filters={filters} />

      <Section title="Зарплата от">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Wallet className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={10000}
              placeholder="Любая"
              value={filters.salary_min ?? ""}
              onChange={(e) => set({ salary_min: e.target.value ? Number(e.target.value) : undefined })}
              className="pl-8 tabular-nums"
            />
          </div>
          <Select value={filters.currency ?? "RUB"} onChange={(e) => set({ currency: e.target.value as Currency })} aria-label="Валюта">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {currencySign(c)}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(SALARY_PRESETS[filters.currency ?? "RUB"] ?? SALARY_PRESETS.RUB).map((v) => (
            <Chip key={v} active={filters.salary_min === v} onClick={() => set({ salary_min: filters.salary_min === v ? undefined : v })}>
              {presetLabel(v)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Грейд">
        <div className="flex flex-wrap gap-1.5">
          {GRADES.map((g) => (
            <Chip key={g} active={filters.grade?.includes(g)} onClick={() => set({ grade: toggle(filters.grade, g) })}>
              {GRADE_LABEL[g]}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Формат">
        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map((g) => (
            <Chip key={g} active={filters.format?.includes(g)} onClick={() => set({ format: toggle(filters.format, g) })}>
              {FORMAT_LABEL[g]}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Технологии">
        {meta.isLoading ? (
          <div className="flex flex-wrap gap-1.5">
            {["w-14", "w-20", "w-12", "w-16", "w-24", "w-14", "w-16"].map((w, i) => (
              <Skeleton key={i} className={`h-7 rounded-full ${w}`} />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {visibleTags.map((t) => (
                <Chip key={t.tag} active={filters.tags?.includes(t.tag)} onClick={() => set({ tags: toggle(filters.tags, t.tag) })}>
                  {filters.tags?.includes(t.tag) && <Check className="h-3 w-3" />}
                  {t.tag}
                  <span className="text-[10.5px] tabular-nums text-muted-foreground">{t.count}</span>
                </Chip>
              ))}
            </div>
            {tags.length > 14 && (
              <button onClick={() => setShowAllTags(!showAllTags)} className="mt-2 cursor-pointer text-[12px] text-muted-foreground hover:text-foreground">
                {showAllTags ? "Свернуть" : `Ещё ${tags.length - 14}`}
              </button>
            )}
          </>
        )}
      </Section>

      <Section title="Источник">
        <div className="space-y-1">
          {(meta.data?.sources ?? [{ key: "habr", title: "Habr Карьера", count: 0 }, { key: "telegram", title: "Telegram", count: 0 }, { key: "devkg", title: "DevKG", count: 0 }, { key: "geekjob", title: "GeekJob", count: 0 }]).map((s) => {
            const active = filters.source?.includes(s.key);
            const m = sourceMeta(s.key);
            return (
              <button
                key={s.key}
                onClick={() => set({ source: toggle(filters.source, s.key) })}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className={cn("grid h-4 w-4 place-items-center rounded border", active ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className={cn("h-2 w-2 rounded-full", m.dot)} />
                <span className="flex-1 text-left">{s.title}</span>
                {s.count > 0 && <span className="text-[11.5px] tabular-nums text-muted-foreground">{s.count}</span>}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Город">
        <Select value={filters.city ?? ""} onChange={(e) => set({ city: e.target.value || undefined })} className="w-full">
          <option value="">Любой город</option>
          {meta.data?.cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} ({c.count})
            </option>
          ))}
        </Select>
      </Section>

      <div className="space-y-3 pt-4">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[13px]">
            <Ghost className="h-3.5 w-3.5 text-muted-foreground" />
            Скрыть вечные вакансии
          </span>
          <Switch checked={!!filters.hide_ghost} onCheckedChange={(v) => set({ hide_ghost: v })} />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[13px]">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            Только с зарплатой
          </span>
          <Switch checked={!!filters.only_with_salary} onCheckedChange={(v) => set({ only_with_salary: v })} />
        </label>
      </div>
    </div>
  );
}
