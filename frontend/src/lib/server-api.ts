/* Server-side data access (server components, metadata, sitemap, OG images).
   Talks to the backend directly over the internal network, bypassing the browser-facing proxy. */

import type { VacancyDetail } from "./types";

// INTERNAL_API_URL is a build arg of the web image: next.config also inlines it as NJA_INTERNAL_API_URL,
// so the standalone server knows it at runtime even when the container environment does not set it.
const INTERNAL_API = (process.env.INTERNAL_API_URL || process.env.NJA_INTERNAL_API_URL || "http://localhost:8000").replace(/\/+$/, "");
const BASE = `${INTERNAL_API}/api/v1`;

export class BackendUnavailable extends Error {}

async function get(path: string, revalidate: number, timeoutMs = 6000): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new BackendUnavailable(e instanceof Error ? e.message : String(e));
  }
}

/** null = no such vacancy (404/422); throws BackendUnavailable when the backend cannot be reached. */
export async function fetchVacancy(id: string): Promise<VacancyDetail | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const res = await get(`/vacancies/${id}`, 300);
  if (res.status === 404 || res.status === 422) return null;
  if (!res.ok) throw new BackendUnavailable(`HTTP ${res.status}`);
  return (await res.json()) as VacancyDetail;
}

export type SitemapItem = { id: number; updated_at: string };

/** Never throws: an unreachable backend (e.g. during `next build`) yields an empty list. */
export async function fetchSitemapItems(): Promise<SitemapItem[]> {
  try {
    const res = await get("/seo/sitemap", 3600, 10_000);
    if (!res.ok) return [];
    const j = (await res.json()) as { items?: SitemapItem[] };
    return Array.isArray(j.items) ? j.items : [];
  } catch {
    return [];
  }
}
