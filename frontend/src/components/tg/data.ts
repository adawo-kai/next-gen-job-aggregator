"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Profile, TrackerBoard, TrackerStatus, VacancyCard } from "@/lib/types";
import { STATUS_ORDER } from "@/lib/utils";

/** Query keys of the Mini App (namespaced so they never collide with the website's cache shapes). */
export const K = {
  me: ["tg", "me"] as const,
  profile: ["tg", "profile"] as const,
  meta: ["tg", "meta"] as const,
  tracker: ["tg", "tracker"] as const,
  subs: ["tg", "subs"] as const,
  feed: (key: unknown) => ["tg", "feed", key] as const,
  feedAll: ["tg", "feed"] as const,
  vacancy: (id: string) => ["tg", "vacancy", id] as const,
  match: (id: string) => ["tg", "match", id] as const,
};

export const useMe = () => useQuery({ queryKey: K.me, queryFn: api.me, staleTime: 5 * 60_000 });
export const useProfile = () => useQuery({ queryKey: K.profile, queryFn: api.profile, staleTime: 60_000 });
export const useMeta = () => useQuery({ queryKey: K.meta, queryFn: api.meta, staleTime: 30 * 60_000 });

/** Fallback copy of the backend state machine (used only if an older backend omits `transitions`). */
export const DEFAULT_TRANSITIONS: Record<TrackerStatus, TrackerStatus[]> = {
  saved: ["applied", "rejected"],
  applied: ["saved", "test_task", "interview", "offer", "rejected"],
  test_task: ["applied", "interview", "offer", "rejected"],
  interview: ["test_task", "applied", "offer", "rejected"],
  offer: ["interview", "rejected"],
  rejected: ["applied", "test_task", "interview"],
};

export function normalizeBoard(b?: TrackerBoard): Required<TrackerBoard> {
  const columns = {} as TrackerBoard["columns"];
  for (const s of STATUS_ORDER) columns[s] = b?.columns?.[s] ?? [];
  return { columns, transitions: b?.transitions ?? DEFAULT_TRANSITIONS };
}

export const useTracker = (enabled = true) =>
  useQuery({ queryKey: K.tracker, queryFn: api.tracker, select: normalizeBoard, enabled, staleTime: 15_000 });

export function profileHasSignal(p?: Profile | null) {
  return !!p && (p.skills.length > 0 || !!p.grade);
}

export function findTrackedItem(board: Required<TrackerBoard> | undefined, vacancyId: number) {
  if (!board) return null;
  for (const s of STATUS_ORDER) {
    const it = board.columns[s].find((i) => i.vacancy.id === vacancyId);
    if (it) return it;
  }
  return null;
}

/** Card data already in the feed cache: lets the detail screen paint its header instantly. */
export function cardFromCache(pages: unknown[], id: number): VacancyCard | null {
  for (const data of pages) {
    const ps = (data as { pages?: { items: VacancyCard[] }[] } | undefined)?.pages;
    if (!ps) continue;
    for (const p of ps) {
      const hit = p.items.find((v) => v.id === id);
      if (hit) return hit;
    }
  }
  return null;
}

export const BOT_USERNAME = (process.env.NEXT_PUBLIC_BOT_USERNAME || "NextGenJobAgr_bot").replace(/^@/, "");
