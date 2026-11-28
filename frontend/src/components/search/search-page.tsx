"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownWideNarrow, Ghost, Layers, Loader2, Radar, Search, SearchX, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, filtersToQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { SortKey, VacancyFilters } from "@/lib/types";
import { cn, FORMAT_LABEL, GRADE_LABEL, plural, sourceMeta } from "@/lib/utils";
import { Button, Card, EmptyState, Kbd } from "@/components/ui/primitives";
import { VacancyCard, VacancyCardSkeleton } from "@/components/vacancy/vacancy-card";
import { activeFilterCount, FilterPanel } from "./filter-panel";

const SORTS: { key: SortKey; label: string; auth?: boolean }[] = [
  { key: "relevance", label: "По релевантности" },
  { key: "date", label: "Сначала новые" },
  { key: "salary", label: "По зарплате" },
  { key: "match", label: "По match score", auth: true },
];

const SUGGESTIONS = ["Python senior удалёнка", "React", "Go Kafka", "Data Engineer", "DevOps"];

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function loadFilters(): VacancyFilters {
  try {
    const raw = localStorage.getItem("nja.lastFilters");
    if (raw) return JSON.parse(raw) as VacancyFilters;
  } catch {}
  return {};
}

const DEFAULTS: VacancyFilters = { sort: "relevance", currency: "RUB" };

/** The URL is the source of truth for a search: shareable links, reload and back/forward just work. */
function filtersFromUrl(p: URLSearchParams): VacancyFilters {
  const list = <T extends string>(k: string) => (p.getAll(k).filter(Boolean) as T[]) || undefined;
  const num = (k: string) => {
    const n = Number(p.get(k));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const f: VacancyFilters = {
    q: p.get("q") ?? undefined,
    salary_min: num("salary_min"),
    currency: (p.get("currency") as VacancyFilters["currency"]) ?? undefined,
    grade: list("grade"),
    tags: list("tags"),
    format: list("format"),
    source: list("source"),
    city: p.get("city") ?? undefined,
    hide_ghost: p.get("hide_ghost") === "true" || undefined,
    only_with_salary: p.get("only_with_salary") === "true" || undefined,
    sort: (p.get("sort") as VacancyFilters["sort"]) ?? undefined,
  };
  for (const k of Object.keys(f) as (keyof VacancyFilters)[]) {
    const v = f[k];
    if (v === undefined || (Array.isArray(v) && v.length === 0)) delete f[k];
  }
  return { ...DEFAULTS, ...f };
}

/** Only what differs from the defaults goes into the address bar. */
function filtersToUrl(f: VacancyFilters): string {
  const clean: VacancyFilters = { ...f, q: f.q?.trim() || undefined };
  if (clean.sort === DEFAULTS.sort) delete clean.sort;
  if (clean.currency === DEFAULTS.currency) delete clean.currency;
  return filtersToQuery(clean);
}

function isEmptySearch(f: VacancyFilters) {
  return !f.q?.trim() && activeFilterCount(f) === 0;
}

export function SearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { isAuthed } = useAuth();
  const [filters, setFilters] = useState<VacancyFilters>({ sort: "relevance", currency: "RUB" });
  const [hydrated, setHydrated] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const heroSearchRef = useRef<HTMLDivElement>(null);
  const [heroInView, setHeroInView] = useState(true);

  useEffect(() => {
    const el = heroSearchRef.current;
    if (!el) return;
    // 56px = sticky site header
    const io = new IntersectionObserver(([e]) => setHeroInView(e.isIntersecting), { rootMargin: "-56px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // URL -> state (first load, back/forward, links). Our own writes are recognised and skipped.
  const lastWritten = useRef<string | null>(null);
  const [savedSearch, setSavedSearch] = useState<VacancyFilters | null>(null);
  useEffect(() => {
    const qs = params.toString();
    if (lastWritten.current !== null && qs === lastWritten.current) return;
    const fromUrl = filtersFromUrl(new URLSearchParams(qs));
    setFilters(fromUrl);
    lastWritten.current = filtersToUrl(fromUrl);
    // the previous search is offered, never applied silently
    if (!hydrated && isEmptySearch(fromUrl)) {
      const saved = loadFilters();
      if (!isEmptySearch(saved)) setSavedSearch(saved);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // state -> URL (debounced) + remember the last non-empty search for the "вернуть поиск" banner
  const debouncedForUrl = useDebounced(filters, 400);
  useEffect(() => {
    if (!hydrated) return;
    const qs = filtersToUrl(debouncedForUrl);
    if (qs !== lastWritten.current) {
      lastWritten.current = qs;
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    }
    if (!isEmptySearch(debouncedForUrl)) {
      setSavedSearch(null);
      try {
        localStorage.setItem("nja.lastFilters", JSON.stringify(debouncedForUrl));
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedForUrl, hydrated]);

  // "/" focuses the search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const debounced = useDebounced(filters, 280);
  const effective = useMemo<VacancyFilters>(
    () => ({ ...debounced, sort: debounced.sort === "match" && !isAuthed ? "relevance" : debounced.sort }),
    [debounced, isAuthed],
  );

  const query = useInfiniteQuery({
    queryKey: ["vacancies", effective, isAuthed],
    queryFn: ({ pageParam }) => api.vacancies(effective, pageParam, 12),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: hydrated,
  });

  const market = useQuery({ queryKey: ["market-hero"], queryFn: () => api.market(), staleTime: 5 * 60_000 });

  // infinite scroll sentinel
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const filterCount = activeFilterCount(filters);

  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.q?.trim()) chips.push({ key: "q", label: `Запрос: ${filters.q.trim()}`, remove: () => setFilters({ ...filters, q: "" }) });
  filters.grade?.forEach((g) => chips.push({ key: `g${g}`, label: GRADE_LABEL[g], remove: () => setFilters({ ...filters, grade: filters.grade!.filter((x) => x !== g) }) }));
  filters.format?.forEach((g) => chips.push({ key: `f${g}`, label: FORMAT_LABEL[g], remove: () => setFilters({ ...filters, format: filters.format!.filter((x) => x !== g) }) }));
  filters.tags?.forEach((g) => chips.push({ key: `t${g}`, label: g, remove: () => setFilters({ ...filters, tags: filters.tags!.filter((x) => x !== g) }) }));
  filters.source?.forEach((g) => chips.push({ key: `s${g}`, label: sourceMeta(g).title, remove: () => setFilters({ ...filters, source: filters.source!.filter((x) => x !== g) }) }));
  if (filters.city) chips.push({ key: "city", label: filters.city, remove: () => setFilters({ ...filters, city: undefined }) });
  if (filters.salary_min) chips.push({ key: "sal", label: `от ${filters.salary_min.toLocaleString("ru-RU")} ${filters.currency ?? "RUB"}`, remove: () => setFilters({ ...filters, salary_min: undefined }) });
  if (filters.hide_ghost) chips.push({ key: "ghost", label: "Без вечных", remove: () => setFilters({ ...filters, hide_ghost: false }) });
  if (filters.only_with_salary) chips.push({ key: "ows", label: "С зарплатой", remove: () => setFilters({ ...filters, only_with_salary: false }) });

  const t = market.data?.totals;

  return (
    <div>
      {/* ---------- Search (the hero heading is server-rendered by the page) ---------- */}
      <section className="relative pb-8 text-center sm:pb-10">
        <motion.div
          ref={heroSearchRef}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="relative mx-auto mt-8 max-w-2xl"
        >
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-violet-500/40 via-indigo-500/20 to-cyan-400/40 opacity-60 blur-md" />
          <div className="relative flex items-center gap-2 rounded-2xl border border-border-strong bg-elevated/95 p-1.5 pl-4 shadow-2xl shadow-black/20 backdrop-blur focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={filters.q ?? ""}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Должность, стек или компания…"
              className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground/60"
              aria-label="Поиск вакансий"
            />
            {filters.q ? (
              <button onClick={() => setFilters({ ...filters, q: "" })} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Очистить">
                <X className="h-4 w-4" />
              </button>
            ) : (
              <Kbd className="mr-2 hidden sm:inline-flex">/</Kbd>
            )}
            <Button size="lg" className="h-11 rounded-xl px-5" onClick={() => inputRef.current?.blur()}>
              <span className="hidden sm:inline">Найти</span>
              <Search className="h-4 w-4 sm:hidden" />
            </Button>
          </div>
        </motion.div>

        <div className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-[12.5px] text-muted-foreground">
          <span>Попробуйте:</span>
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => setFilters({ ...filters, q: s })} className="inline-flex h-10 cursor-pointer items-center rounded-full border px-3 transition-colors hover:border-border-strong hover:text-foreground sm:h-7 sm:px-2.5">
              {s}
            </button>
          ))}
        </div>

        {t && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mx-auto mt-8 grid max-w-2xl grid-cols-3 divide-x rounded-2xl border bg-card/50 backdrop-blur">
            {[
              { icon: Radar, value: t.vacancies, label: "вакансий в базе" },
              { icon: Layers, value: t.merged_duplicates, label: "дублей склеено" },
              { icon: Ghost, value: t.ghosts, label: "вечных отсеяно" },
            ].map((s) => (
              <div key={s.label} className="px-3 py-3 sm:px-5">
                <div className="flex items-center justify-center gap-1.5 text-lg font-semibold tabular-nums tracking-tight sm:text-xl">
                  <s.icon className="h-4 w-4 text-muted-foreground" />
                  {s.value.toLocaleString("ru-RU")}
                </div>
                <div className="text-[11.5px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </motion.div>
        )}
      </section>

      {/* ---------- Mobile: compact sticky search once the hero search scrolls away ---------- */}
      <AnimatePresence>
        {!heroInView && (
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 top-14 z-30 border-b bg-background/90 px-4 py-2 backdrop-blur-xl lg:hidden"
          >
            <div className="mx-auto flex max-w-2xl items-center gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-muted/70 px-3 ring-1 ring-inset ring-border focus-within:ring-2 focus-within:ring-ring">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={filters.q ?? ""}
                  onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                  placeholder="Поиск вакансий"
                  enterKeyHint="search"
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground/60"
                  aria-label="Поиск вакансий"
                />
                {filters.q && (
                  <button onClick={() => setFilters({ ...filters, q: "" })} className="-mr-2 grid h-10 w-10 shrink-0 cursor-pointer place-items-center text-muted-foreground" aria-label="Очистить">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button variant="secondary" className="relative h-10 w-10 shrink-0 px-0" onClick={() => setMobileFilters(true)} aria-label="Фильтры">
                <SlidersHorizontal className="h-4 w-4" />
                {filterCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{filterCount}</span>}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Body ---------- */}
      <div className="grid gap-6 lg:grid-cols-[272px_1fr]">
        <aside className="hidden lg:block">
          <Card className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto p-4 scrollbar-thin">
            <FilterPanel filters={filters} onChange={setFilters} />
          </Card>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
              {query.isError ? (
                <span>Нет данных</span>
              ) : query.isLoading || !hydrated ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ищем вакансии…
                </span>
              ) : (
                <span>
                  Найдено <span className="font-semibold tabular-nums text-foreground">{total.toLocaleString("ru-RU")}</span> {plural(total, "вакансия", "вакансии", "вакансий")}
                </span>
              )}
              {query.isFetching && !query.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <Button variant="secondary" size="sm" className="h-10 shrink-0 lg:hidden" onClick={() => setMobileFilters(true)}>
                <SlidersHorizontal className="h-3.5 w-3.5" /> Фильтры
                {filterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10.5px] text-primary-foreground">{filterCount}</span>}
              </Button>
              <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-muted/60 p-0.5 ring-1 ring-inset ring-border [scrollbar-width:none]">
                <ArrowDownWideNarrow className="ml-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {SORTS.map((s) => {
                  const disabled = s.auth && !isAuthed;
                  const active = filters.sort === s.key;
                  return (
                    <button
                      key={s.key}
                      disabled={disabled}
                      title={disabled ? "Войдите, чтобы сортировать по match score" : undefined}
                      onClick={() => setFilters({ ...filters, sort: s.key })}
                      className={cn(
                        "relative h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:h-7 sm:px-2.5",
                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && <motion.span layoutId="sort-pill" className="absolute inset-0 -z-0 rounded-md bg-elevated shadow-sm ring-1 ring-border" transition={{ type: "spring", bounce: 0.15, duration: 0.4 }} />}
                      <span className="relative z-10 inline-flex items-center gap-1">
                        {s.key === "match" && <Sparkles className="h-3 w-3" />}
                        <span className="hidden sm:inline">{s.label}</span>
                        <span className="sm:hidden">{s.label.split(" ").pop()}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {savedSearch && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card/60 px-3 py-2 text-[13px]">
              <span className="text-muted-foreground">Прошлый поиск:</span>
              <span className="min-w-0 truncate font-medium">
                {[savedSearch.q?.trim(), ...(savedSearch.grade ?? []).map((g) => GRADE_LABEL[g]), ...(savedSearch.tags ?? []), ...(savedSearch.format ?? []).map((f) => FORMAT_LABEL[f])]
                  .filter(Boolean)
                  .slice(0, 4)
                  .join(" · ") || `${activeFilterCount(savedSearch)} фильтр.`}
              </span>
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => { setFilters({ ...DEFAULTS, ...savedSearch }); setSavedSearch(null); }}>
                  Вернуть
                </Button>
                <button onClick={() => setSavedSearch(null)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Скрыть">
                  <X className="h-4 w-4" />
                </button>
              </span>
            </div>
          )}

          <AnimatePresence initial={false}>
            {chips.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-4 flex flex-wrap gap-1.5 overflow-hidden">
                {chips.map((c) => (
                  <motion.button
                    layout
                    key={c.key}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={c.remove}
                    className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-primary/10 pl-2.5 pr-1.5 text-[12px] font-medium text-foreground ring-1 ring-inset ring-primary/30 hover:bg-primary/15"
                  >
                    {c.label}
                    <X className="h-3 w-3 text-muted-foreground" />
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {!isAuthed && (
            <Card className="mb-4 flex flex-col items-start gap-3 overflow-hidden bg-gradient-to-r from-violet-500/[0.08] via-transparent to-cyan-500/[0.08] p-4 sm:flex-row sm:items-center">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-500 dark:text-violet-300">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 text-[13.5px]">
                <div className="font-medium">Загрузите резюме — и мы посчитаем match score для каждой вакансии</div>
                <div className="text-muted-foreground">Объяснимый скор: какие навыки совпали, чего не хватает, что даст +N вакансий.</div>
              </div>
              <Button size="sm" onClick={() => router.push("/register")}>Попробовать</Button>
            </Card>
          )}

          <div className="space-y-3">
            {(query.isLoading || !hydrated) && Array.from({ length: 5 }).map((_, i) => <VacancyCardSkeleton key={i} />)}
            {query.isError && (
              <EmptyState icon={<SearchX className="h-5 w-5" />} title="Не удалось загрузить вакансии" description={(query.error as Error).message} action={<Button onClick={() => query.refetch()}>Повторить</Button>} />
            )}
            {hydrated && !query.isLoading && !query.isError && items.length === 0 && (
              <EmptyState
                icon={<SearchX className="h-5 w-5" />}
                title="Ничего не нашли"
                description="Попробуйте ослабить фильтры или изменить запрос — например, убрать город или минимальную зарплату."
                action={
                  <Button variant="secondary" onClick={() => setFilters({ sort: filters.sort, currency: filters.currency })}>
                    Сбросить фильтры
                  </Button>
                }
              />
            )}
            {items.map((v, i) => (
              <VacancyCard key={v.id} v={v} index={i % 12} />
            ))}
            {query.isFetchingNextPage && Array.from({ length: 2 }).map((_, i) => <VacancyCardSkeleton key={`n${i}`} />)}
            <div ref={sentinel} className="h-1" />
            {!query.hasNextPage && items.length > 0 && (
              <div className="flex items-center justify-center gap-3 py-6 text-[12.5px] text-muted-foreground">
                <span className="h-px w-12 bg-border" />
                Это все вакансии по запросу
                <span className="h-px w-12 bg-border" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Mobile filters sheet ---------- */}
      <Dialog.Root open={mobileFilters} onOpenChange={setMobileFilters}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t bg-elevated p-5 pb-8 scrollbar-thin">
            <Dialog.Title className="sr-only">Фильтры</Dialog.Title>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
            <FilterPanel filters={filters} onChange={setFilters} />
            <Button className="mt-5 w-full" onClick={() => setMobileFilters(false)}>
              Показать {total} {plural(total, "вакансию", "вакансии", "вакансий")}
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
