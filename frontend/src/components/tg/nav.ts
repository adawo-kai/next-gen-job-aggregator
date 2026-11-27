"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/* In-app navigation depth. Screens opened from inside the app can go `router.back()`; screens opened
   directly (bot button URL, startapp deep link) have nothing to go back to, so they fall back to the feed. */
let depth = 0;

export function usePushScreen() {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      depth++;
      router.push(href);
    },
    [router],
  );
}

export function useGoBack(fallback = "/tg") {
  const router = useRouter();
  return useCallback(() => {
    if (depth > 0) {
      depth--;
      router.back();
    } else router.replace(fallback);
  }, [router, fallback]);
}

/* Feed scroll position survives a round-trip to a vacancy and back. */
const scrollMemo = new Map<string, number>();
export const rememberScroll = (key: string) => scrollMemo.set(key, window.scrollY);
export const recallScroll = (key: string) => scrollMemo.get(key) ?? 0;
