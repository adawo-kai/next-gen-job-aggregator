/* Public site constants (safe for both server and client code). */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const SITE_NAME = "JobRadar";
export const SITE_TAGLINE = "умный агрегатор IT-вакансий";
export const SITE_DESCRIPTION =
  "IT-вакансии с Habr Карьеры, GeekJob, DevKG и Telegram в одной ленте: без дублей, с AI-выжимкой, match score по резюме, детектором вечных вакансий и трекером откликов.";

export const BOT_USERNAME = (process.env.NEXT_PUBLIC_BOT_USERNAME || "NextGenJobAgr_bot").replace(/^@/, "");
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;
export const GITHUB_URL = "https://github.com/adawo-kai/next-gen-job-aggregator";
export const CONTACT_TG = "adawo_creator";
export const CONTACT_TG_URL = `https://t.me/${CONTACT_TG}`;

export const absoluteUrl = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
