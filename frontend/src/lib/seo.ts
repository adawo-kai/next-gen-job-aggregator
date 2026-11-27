/* Structured data and meta text for vacancy pages (server-side). */

import type { VacancyDetail } from "./types";
import { absoluteUrl, SITE_NAME } from "./site";
import { FORMAT_LABEL, GRADE_LABEL, formatSalary } from "./utils";

const COUNTRY_CODE: Record<string, string> = {
  россия: "RU",
  рф: "RU",
  russia: "RU",
  казахстан: "KZ",
  kazakhstan: "KZ",
  беларусь: "BY",
  belarus: "BY",
  узбекистан: "UZ",
  кыргызстан: "KG",
  киргизия: "KG",
  киргизстан: "KG",
  kyrgyzstan: "KG",
  армения: "AM",
  грузия: "GE",
  азербайджан: "AZ",
  сербия: "RS",
  кипр: "CY",
  турция: "TR",
  оаэ: "AE",
  германия: "DE",
  польша: "PL",
  нидерланды: "NL",
  португалия: "PT",
  испания: "ES",
  черногория: "ME",
  таджикистан: "TJ",
  молдова: "MD",
  латвия: "LV",
  литва: "LT",
  эстония: "EE",
};

const countryCode = (country: string | null) => (country ? COUNTRY_CODE[country.trim().toLowerCase()] ?? country : null);

/** Where remote applicants may live: the stated country, else inferred from the salary currency. */
function applicantCountry(v: VacancyDetail) {
  if (v.country) return countryCode(v.country)!;
  if (v.salary.currency === "KZT") return "KZ";
  if (v.salary.currency === "KGS" || v.sources.some((s) => s.source === "devkg")) return "KG";
  return "RU";
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

const stripHtml = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

export function vacancyPlainDescription(v: VacancyDetail): string {
  const text = v.description_text?.trim() || (v.description_html ? stripHtml(v.description_html) : "");
  if (text) return text;
  const s = v.summary;
  if (!s) return v.title;
  return [
    s.what_to_do.length ? `Задачи: ${s.what_to_do.join("; ")}` : "",
    s.requirements.length ? `Требования: ${s.requirements.join("; ")}` : "",
    s.conditions.length ? `Условия: ${s.conditions.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A real (published) salary: estimates are never exposed as baseSalary. */
export const realSalary = (v: VacancyDetail) => !v.salary.estimated && (v.salary.from != null || v.salary.to != null);

export function vacancyTitle(v: VacancyDetail) {
  return `${v.title} — ${v.company.name} | ${SITE_NAME}`;
}

export function vacancyMetaDescription(v: VacancyDetail): string {
  const parts: string[] = [];
  const salary = realSalary(v) ? formatSalary({ ...v.salary, converted_from: null, converted_to: null }) : null;
  if (salary) parts.push(salary);
  const where = [v.city, v.format ? FORMAT_LABEL[v.format].toLowerCase() : null].filter(Boolean).join(", ");
  if (where) parts.push(where);
  if (v.grade) parts.push(GRADE_LABEL[v.grade]);
  const head = `${v.title} в ${v.company.name}${parts.length ? `: ${parts.join(" · ")}` : ""}.`;
  const tail = v.summary?.what_to_do?.length
    ? ` ${v.summary.what_to_do.slice(0, 2).join("; ")}.`
    : v.tags.length
      ? ` Стек: ${v.tags.slice(0, 6).join(", ")}.`
      : "";
  return clip(`${head}${tail}`.replace(/\s+/g, " ").replace(/\.\./g, "."), 200);
}

function employmentType(v: VacancyDetail): string {
  const t = `${v.title} ${v.description_text ?? ""}`.toLowerCase();
  if (v.grade === "intern" || /стаж[её]р|стажировк|\bintern(ship)?\b/.test(v.title.toLowerCase())) return "INTERN";
  if (/частичн(ая|ой) занятост|part[- ]time/.test(t)) return "PART_TIME";
  if (/проектн(ая|ой) (работ|занятост)|\bcontract(or)?\b|фриланс/.test(t)) return "CONTRACTOR";
  return "FULL_TIME";
}

/** schema.org JobPosting for Google for Jobs (https://developers.google.com/search/docs/appearance/structured-data/job-posting). */
export function jobPostingJsonLd(v: VacancyDetail) {
  const posted = new Date(v.published_at || v.first_seen_at);
  const validThrough = new Date(posted.getTime() + 30 * 86400_000);
  const remote = v.format === "remote";

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: v.title,
    description: clip(vacancyPlainDescription(v), 9000),
    datePosted: posted.toISOString(),
    validThrough: validThrough.toISOString(),
    employmentType: employmentType(v),
    hiringOrganization: {
      "@type": "Organization",
      name: v.company.name,
      ...(v.company.logo_url ? { logo: v.company.logo_url } : {}),
    },
    identifier: { "@type": "PropertyValue", name: SITE_NAME, value: String(v.id) },
    url: absoluteUrl(`/vacancies/${v.id}`),
    directApply: false,
    ...(v.tags.length ? { skills: v.tags.join(", ") } : {}),
  };

  if (remote) {
    ld.jobLocationType = "TELECOMMUTE";
    ld.applicantLocationRequirements = { "@type": "Country", name: applicantCountry(v) };
  }
  // offices are required for on-site/hybrid roles; for remote ones a city is still useful when known
  if (!remote || v.city) {
    ld.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(v.city ? { addressLocality: v.city } : {}),
        addressCountry: countryCode(v.country) ?? applicantCountry(v),
      },
    };
  }

  if (realSalary(v)) {
    const { from, to } = v.salary;
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: v.salary.currency,
      // "от X" -> minValue only, "до Y" -> maxValue only
      value: { "@type": "QuantitativeValue", ...(from != null ? { minValue: from } : {}), ...(to != null ? { maxValue: to } : {}), unitText: "MONTH" },
    };
  }
  return ld;
}

/** Safe to inline into <script type="application/ld+json">. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
