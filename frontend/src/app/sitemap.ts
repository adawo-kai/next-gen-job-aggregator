import type { MetadataRoute } from "next";
import { fetchSitemapItems } from "@/lib/server-api";
import { absoluteUrl } from "@/lib/site";

// Rendered at request time (the backend is not reachable during `next build`, a build-time snapshot would
// ship without vacancies for the first hour). The API answer itself is cached (Redis + fetch cache).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPart: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: absoluteUrl("/analytics"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
  ];
  const items = await fetchSitemapItems();
  // the sitemap protocol allows 50 000 URLs per file
  const vacancies: MetadataRoute.Sitemap = items.slice(0, 49_000).map((v) => {
    const d = new Date(v.updated_at);
    return {
      url: absoluteUrl(`/vacancies/${v.id}`),
      ...(Number.isNaN(d.getTime()) ? {} : { lastModified: d }),
      changeFrequency: "daily",
      priority: 0.6,
    };
  });
  return [...staticPart, ...vacancies];
}
