import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Ghost, Layers, ListChecks, Send, Sparkles, Target } from "lucide-react";
import { SearchPage } from "@/components/search/search-page";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, BOT_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}: Habr Карьера, GeekJob, DevKG и Telegram в одной ленте` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const FEATURES = [
  { icon: Layers, title: "Без дублей", text: "Одна и та же вакансия с разных площадок склеивается в одну карточку со ссылками на все оригиналы." },
  { icon: Sparkles, title: "AI-выжимка", text: "Что делать, что требуют и какие условия — коротко, без «дружного коллектива» и воды." },
  { icon: Target, title: "Match score", text: "Загрузите резюме: для каждой вакансии посчитаем совпадение и объясним, каких навыков не хватает." },
  { icon: Ghost, title: "Вечные вакансии", text: "Подсвечиваем объявления, которые месяцами перевыкладывают без найма, и red flags в тексте." },
  { icon: ListChecks, title: "Трекер откликов", text: "Канбан откликов от «Сохранено» до оффера с заметками и напоминаниями написать HR." },
  { icon: Send, title: "Telegram-бот", text: "Мгновенные уведомления о подходящих вакансиях и мини-приложение прямо в Telegram." },
];

/** Placeholder with the search bar's footprint while the interactive search hydrates (no layout shift). */
function SearchFallback() {
  return (
    <div className="pb-8 sm:pb-10">
      <div className="mx-auto mt-8 h-[58px] max-w-2xl rounded-2xl border border-border-strong bg-elevated/95" />
    </div>
  );
}

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "ru",
  description: SITE_DESCRIPTION,
  potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/?q={search_term_string}`, "query-input": "required name=search_term_string" },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(websiteLd) }} />
      {/* server-rendered: crawlers see the heading and intro without running JavaScript */}
      <section className="relative pt-6 text-center sm:pt-12">
        <div className="mx-auto mb-5 inline-flex max-w-full items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-[12px] text-muted-foreground backdrop-blur">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span>
            Habr Карьера · GeekJob · DevKG · Telegram<span className="hidden sm:inline"> — обновляется каждые 20 минут</span>
          </span>
        </div>
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">
          <span className="text-gradient">Все IT-вакансии.</span>
          <br />
          <span className="text-brand">Без дублей и воды.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          Собираем вакансии для разработчиков, тестировщиков, аналитиков и DevOps с Habr Карьеры, GeekJob, DevKG и Telegram-каналов, склеиваем дубли, выжимаем суть с помощью AI, считаем match с вашим резюме и подсвечиваем red flags и вечный поиск.
        </p>
      </section>

      <Suspense fallback={<SearchFallback />}>
        <SearchPage />
      </Suspense>

      <section aria-labelledby="how" className="mt-16 border-t pt-10">
        <h2 id="how" className="text-xl font-semibold tracking-tight sm:text-2xl">
          Как JobRadar помогает искать работу в IT
        </h2>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-muted-foreground">
          {SITE_NAME} — бесплатный агрегатор IT-вакансий. Мы не работодатель и не кадровое агентство: каждая карточка ведёт на оригинальное объявление, а отклик вы отправляете напрямую компании.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card/60 p-5">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 text-[15px] font-semibold">{f.title}</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[13.5px] text-muted-foreground">
          Смотрите{" "}
          <Link href="/analytics" className="font-medium text-foreground underline-offset-4 hover:underline">
            аналитику IT-рынка
          </Link>{" "}
          — зарплаты по грейдам и самые востребованные навыки, или{" "}
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline">
            откройте бота в Telegram
          </a>
          .
        </p>
      </section>
    </>
  );
}
