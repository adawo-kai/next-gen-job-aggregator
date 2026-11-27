"use client";

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, Search, SearchX, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Grade, VacancyCard as Card, VacancyFilters } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { K, profileHasSignal, useMe, useProfile } from "./data";
import { recallScroll, rememberScroll, usePushScreen } from "./nav";
import { haptic, useTelegram } from "./telegram";
import { Avatar, Button, Chip, EmptyState, Segmented, Skeleton, Spinner } from "./ui";
import { VacancyCard, VacancyCardSkeleton } from "./vacancy-card";

type Quick = "remote" | "junior" | "middle" | "senior" | "salary" | "noghost";
const QUICK: { key: Quick; label: string }[] = [
  { key: "remote", label: "Удалёнка" },
  { key: "junior", label: "Junior" },
  { key: "middle", label: "Middle" },
  { key: "senior", label: "Senior" },
  { key: "salary", label: "С зарплатой" },
  { key: "noghost", label: "Скрыть вечные" },
];

type FeedState = { q: string; quick: Quick[]; sort: "auto" | "match" | "date" };
// survives unmount (feed -> vacancy -> back) for the lifetime of the app session
let saved: FeedState = { q: "", quick: [], sort: "auto" };

function toFilters(s: FeedState, sort: "match" | "date"): VacancyFilters {
  const grades = (["junior", "middle", "senior"] as const).filter((g) => s.quick.includes(g)) as Grade[];
  return {
    q: s.q.trim() || undefined,
    format: s.quick.includes("remote") ? ["remote"] : undefined,
    grade: grades.length ? grades : undefined,
    only_with_salary: s.quick.includes("salary") || undefined,
    hide_ghost: s.quick.includes("noghost") || undefined,
    sort,
  };
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function FeedScreen() {
  const [state, setStateRaw] = useState<FeedState>(saved);
  const setState = useCallback((fn: (s: FeedState) => FeedState) => {
    setStateRaw((s) => {
      const n = fn(s);
      saved = n;
      return n;
    });
  }, []);
  const q = useDebounced(state.q, 350);
  const push = usePushScreen();
  const { user: tgUser } = useTelegram();
  const me = useMe();
  const profile = useProfile();
  const hasSignal = profileHasSignal(profile.data);
  const sort: "match" | "date" = state.sort === "auto" ? (hasSignal ? "match" : "date") : state.sort === "match" && !hasSignal ? "date" : state.sort;
  const filters = useMemo(() => toFilters({ ...state, q }, sort), [state, q, sort]);

  const feed = useInfiniteQuery({
    queryKey: K.feed(filters),
    queryFn: ({ pageParam }) => api.vacancies(filters, pageParam, 20),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    // the sort depends on the profile: wait for it so the first page is not fetched twice
    enabled: !profile.isPending,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const items = useMemo(() => {
    const seen = new Set<number>();
    return (feed.data?.pages ?? []).flatMap((p) => p.items).filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  }, [feed.data]);
  const total = feed.data?.pages[0]?.total ?? null;

  // infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  // scroll restoration after coming back from a vacancy
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !items.length) return;
    restored.current = true;
    const y = recallScroll("feed");
    if (y > 0) window.scrollTo(0, y);
  }, [items.length]);

  const open = useCallback(
    (v: Card) => {
      rememberScroll("feed");
      haptic.impact("light");
      push(`/tg/v/${v.id}`);
    },
    [push],
  );

  const toggleQuick = (k: Quick) => {
    setState((s) => ({ ...s, quick: s.quick.includes(k) ? s.quick.filter((x) => x !== k) : [...s.quick, k] }));
    window.scrollTo({ top: 0 });
  };

  const firstName = tgUser?.first_name || me.data?.display_name?.split(" ")[0] || "";
  const photo = me.data?.photo_url || tgUser?.photo_url || null;
  const filtered = state.quick.length > 0 || !!q.trim();
  const refetching = feed.isFetching && feed.isPlaceholderData;

  return (
    <div>
      {/* greeting */}
      <header className="flex items-center gap-3 px-1 pb-3 pt-1">
        <Avatar src={photo} name={me.data?.display_name || firstName || "JobRadar"} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-muted-foreground">{firstName ? `Привет, ${firstName}` : "Привет!"}</div>
          <div className="truncate text-[20px] font-bold leading-tight tracking-[-0.02em]">
            {total == null ? "Подбираем вакансии…" : sort === "match" ? "Подходящие вакансии" : "Свежие вакансии"}
          </div>
        </div>
      </header>

      {/* sticky search + filters */}
      <div className="sticky z-30 -mx-3 bg-background px-3 pb-2 pt-1" style={{ top: "var(--tg-content-top)" }}>
        <label className="flex h-11 items-center gap-2 rounded-xl bg-card px-3">
          <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={state.q}
            onChange={(e) => setState((s) => ({ ...s, q: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="Должность, стек или компания"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {state.q && (
            <button type="button" aria-label="Очистить" onClick={() => setState((s) => ({ ...s, q: "" }))} className="-mr-2 grid h-11 w-10 place-items-center text-muted-foreground">
              <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-muted-foreground/60 text-card">
                <X className="h-3 w-3" strokeWidth={3} />
              </span>
            </button>
          )}
        </label>
        <div className="tg-scroll-x -mx-3 mt-2 flex gap-2 px-3 py-[5px]">
          {QUICK.map((f) => (
            <Chip key={f.key} active={state.quick.includes(f.key)} onClick={() => toggleQuick(f.key)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* onboarding: empty profile */}
      {profile.isSuccess && !hasSignal && (
        <button
          type="button"
          onClick={() => {
            haptic.impact("light");
            push("/tg/profile");
          }}
          className="tg-press mt-2 flex w-full items-center gap-3 rounded-[14px] bg-gradient-to-br from-[#6d5cff] to-[#22a6ee] p-4 text-left text-white shadow-[0_10px_30px_-12px_rgba(109,92,255,0.7)]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20">
            <Sparkles className="h-[22px] w-[22px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold leading-tight">Укажите навыки — лента отсортируется по совпадению</span>
            <span className="mt-1 block text-[14px] text-white/80">Или вставьте резюме — навыки найдём сами</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-white/80" />
        </button>
      )}

      {/* count + sort */}
      <div className="mt-3 flex min-h-9 items-center justify-between gap-3 px-1">
        <div className="text-[14px] text-muted-foreground">
          {total == null ? <Skeleton className="h-3.5 w-28" /> : `${total.toLocaleString("ru-RU")} ${plural(total, "вакансия", "вакансии", "вакансий")}`}
        </div>
        {hasSignal && (
          <Segmented
            className="w-[210px]"
            value={sort}
            onChange={(v) => {
              setState((s) => ({ ...s, sort: v }));
              window.scrollTo({ top: 0 });
            }}
            options={[
              { value: "match", label: "Совпадение" },
              { value: "date", label: "Свежие" },
            ]}
          />
        )}
      </div>

      {/* list */}
      <div className={cn("mt-2 space-y-2.5 transition-opacity duration-200", refetching && "opacity-60")}>
        {feed.isPending ? (
          Array.from({ length: 4 }).map((_, i) => <VacancyCardSkeleton key={i} />)
        ) : feed.isError && !items.length ? (
          <EmptyState
            icon={<SearchX className="h-7 w-7" />}
            title="Не удалось загрузить ленту"
            text={(feed.error as Error).message}
            action={
              <Button variant="tinted" onClick={() => feed.refetch()}>
                Повторить
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<SearchX className="h-7 w-7" />}
            title="Ничего не нашлось"
            text={filtered ? "Попробуйте убрать часть фильтров или изменить запрос." : "Новые вакансии появляются каждый час — загляните чуть позже."}
            action={
              filtered ? (
                <Button variant="tinted" onClick={() => setState((s) => ({ ...s, q: "", quick: [] }))}>
                  Сбросить фильтры
                </Button>
              ) : undefined
            }
          />
        ) : (
          items.map((v) => <VacancyCard key={v.id} v={v} onOpen={open} />)
        )}
      </div>

      <div ref={sentinel} className="h-px" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-5">
          <Spinner />
        </div>
      )}
      {!hasNextPage && items.length > 8 && <div className="py-6 text-center text-[13px] text-muted-foreground">Это все вакансии по вашему запросу</div>}
    </div>
  );
}
