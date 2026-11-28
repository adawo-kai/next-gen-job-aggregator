import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VacancyDetailPage } from "@/components/vacancy/detail-page";
import { BackendUnavailable, fetchVacancy } from "@/lib/server-api";
import { jobPostingJsonLd, jsonLdString, vacancyMetaDescription, vacancyTitle } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";
import type { VacancyDetail } from "@/lib/types";

/* Rendered per request (cheap: the backend response itself is cached for 5 minutes in the data cache,
   see lib/server-api). Not ISR on purpose: a failed first render would otherwise be served as a bare 500. */

type Props = { params: Promise<{ id: string }> };

async function load(id: string): Promise<VacancyDetail | null | "unavailable"> {
  try {
    return await fetchVacancy(id);
  } catch (e) {
    if (e instanceof BackendUnavailable) return "unavailable";
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const v = await load(id);
  if (v === "unavailable") return { title: "Вакансия" };
  if (!v) return { title: "Вакансия не найдена — возможно, её уже закрыли", robots: { index: false } };
  const title = vacancyTitle(v);
  const description = vacancyMetaDescription(v);
  const url = `/vacancies/${v.id}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    keywords: [v.title, v.company.name, ...v.tags, v.city ?? "", "вакансия"].filter(Boolean),
    openGraph: {
      type: "article",
      url,
      siteName: SITE_NAME,
      locale: "ru_RU",
      title,
      description,
      publishedTime: v.published_at,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const v = await load(id);
  // backend unreachable from the server: let the client try (it shows a clean error state with "Повторить",
  // or demo data in local development)
  if (v === "unavailable") return <VacancyDetailPage id={id} />;
  if (!v) notFound();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jobPostingJsonLd(v)) }} />
      <VacancyDetailPage id={id} initial={v} />
    </>
  );
}
