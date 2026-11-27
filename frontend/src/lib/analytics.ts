/* Yandex Metrika: loaded only when NEXT_PUBLIC_YM_ID is set (see components/analytics/metrika.tsx).
   Every helper here is a safe no-op otherwise, so call sites never need to check. */

export const YM_ID = Number(process.env.NEXT_PUBLIC_YM_ID || 0) || null;

export type Goal = "signup" | "resume_uploaded" | "tracker_add" | "subscription_created" | "tg_link";

type Ym = (id: number, method: string, ...args: unknown[]) => void;

function ym(): Ym | null {
  if (typeof window === "undefined" || !YM_ID) return null;
  const fn = (window as unknown as { ym?: Ym }).ym;
  return typeof fn === "function" ? fn : null;
}

/** Reaches a Metrika goal (configure goals of type «JavaScript-событие» with the same identifiers). */
export function track(goal: Goal, params?: Record<string, unknown>) {
  try {
    ym()?.(YM_ID!, "reachGoal", goal, params);
  } catch {}
}

/** SPA navigation hit (Metrika only counts the initial page load by itself). */
export function hit(url: string, referer?: string, attempt = 0) {
  if (typeof window === "undefined" || !YM_ID) return;
  const fn = ym();
  // the very first hit can fire before the (afterInteractive) tag has defined window.ym: wait for it
  if (!fn) {
    if (attempt < 40) setTimeout(() => hit(url, referer, attempt + 1), 250);
    return;
  }
  try {
    fn(YM_ID, "hit", url, referer ? { referer } : undefined);
  } catch {}
}
