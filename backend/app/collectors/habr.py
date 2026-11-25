"""Habr Карьера collector (public frontend JSON API + detail HTML for descriptions)."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from dateutil import parser as dtparser
from selectolax.lexbor import LexborHTMLParser

from app.collectors import http
from app.collectors.base import BaseCollector, CollectorError, RawVacancy, register

log = logging.getLogger(__name__)

BASE = "https://career.habr.com"
LIST_URL = f"{BASE}/api/frontend/vacancies"
PER_PAGE = 25

CURRENCY_MAP = {"rur": "RUB", "rub": "RUB", "usd": "USD", "eur": "EUR", "kzt": "KZT", "uah": "UAH", "byr": "BYN", "byn": "BYN"}

GRADE_MAP = {
    "стажёр": "intern",
    "стажер": "intern",
    "intern": "intern",
    "младший": "junior",
    "junior": "junior",
    "средний": "middle",
    "middle": "middle",
    "старший": "senior",
    "senior": "senior",
    "ведущий": "lead",
    "lead": "lead",
}


def map_grade(item: dict[str, Any]) -> str | None:
    candidates = [(item.get("salaryQualification") or {}).get("title"), item.get("qualification")]
    for c in candidates:
        if not c:
            continue
        low = c.lower()
        for k, v in GRADE_MAP.items():
            if k in low:
                return v
    return None


def map_currency(cur: str | None) -> str | None:
    if not cur:
        return None
    return CURRENCY_MAP.get(cur.lower(), cur.upper())


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return dtparser.isoparse(value)
    except (ValueError, TypeError):
        return None


def compose_description(item: dict[str, Any]) -> str:
    """Fallback description when the detail page was not fetched."""
    parts: list[str] = [item.get("title") or ""]
    company = (item.get("company") or {}).get("title")
    if company:
        parts.append(f"Компания: {company}")
    q = (item.get("salaryQualification") or {}).get("title")
    if q:
        parts.append(f"Квалификация: {q}")
    divs = [d.get("title") for d in item.get("divisions") or [] if d.get("title")]
    if divs:
        parts.append("Специализация: " + ", ".join(divs))
    skills = [s.get("title") for s in item.get("skills") or [] if s.get("title")]
    if skills:
        parts.append("Навыки: " + ", ".join(skills))
    locs = [loc.get("title") for loc in item.get("locations") or [] if loc.get("title")]
    if locs:
        parts.append("Локация: " + ", ".join(locs))
    if item.get("remoteWork"):
        parts.append("Можно удалённо")
    sal = (item.get("salary") or {}).get("formatted")
    if sal:
        parts.append(f"Зарплата: {sal}")
    return "\n".join(p for p in parts if p)


def parse_list_item(item: dict[str, Any]) -> RawVacancy:
    """Map one element of ``/api/frontend/vacancies`` ``list`` to RawVacancy (pure)."""
    company = item.get("company") or {}
    salary = item.get("salary") or {}
    locations = [loc.get("title") for loc in item.get("locations") or [] if loc.get("title")]
    city = locations[0] if locations else (item.get("location") or {}).get("title") if isinstance(item.get("location"), dict) else None
    href = item.get("href") or f"/vacancies/{item['id']}"
    skills = [s["title"] for s in item.get("skills") or [] if s.get("title")]
    sal_from, sal_to = salary.get("from"), salary.get("to")
    return RawVacancy(
        source="habr",
        external_id=str(item["id"]),
        url=href if href.startswith("http") else BASE + href,
        title=(item.get("title") or "").strip(),
        company=company.get("title"),
        description=compose_description(item),
        published_at=parse_dt((item.get("publishedDate") or {}).get("date")),
        salary_from=int(sal_from) if sal_from else None,
        salary_to=int(sal_to) if sal_to else None,
        currency=map_currency(salary.get("currency")) if (sal_from or sal_to) else None,
        salary_gross=None,
        city=city,
        country=None,
        work_format="remote" if item.get("remoteWork") else ("office" if locations else None),
        grade_hint=map_grade(item),
        skills_hint=skills,
        company_logo=(company.get("logo") or {}).get("src"),
        payload=item,
    )


def extract_description(page_html: str) -> str | None:
    """Pull the vacancy description block from a detail page (pure)."""
    tree = LexborHTMLParser(page_html)
    node = (
        tree.css_first(".vacancy-description__text")
        or tree.css_first(".basic-section--appearance-vacancy-description .style-ugc")
        or tree.css_first(".style-ugc")
    )
    if node is None:
        return None
    text = http.html_to_text(node.html or "")
    return text or None


@register("habr")
class HabrCollector(BaseCollector):
    title = "Habr Карьера"
    min_interval = 0.5

    async def _page(self, page: int) -> dict[str, Any]:
        params = {"q": getattr(self.settings, "habr_query", "") or "", "type": "all", "page": page, "per_page": PER_PAGE}
        data = await http.fetch(self.key, LIST_URL, params=params, min_interval=self.min_interval, as_json=True)
        if not isinstance(data, dict) or "list" not in data:
            raise CollectorError("habr: unexpected list response shape")
        return data

    async def collect(self, limit: int = 100) -> list[RawVacancy]:
        out: list[RawVacancy] = []
        seen: set[str] = set()
        page, total_pages = 1, None
        while len(out) < limit and (total_pages is None or page <= total_pages):
            data = await self._page(page)
            total_pages = (data.get("meta") or {}).get("totalPages") or page
            items = data.get("list") or []
            if not items:
                break
            for item in items:
                if item.get("archived") or item.get("hidden"):
                    continue
                try:
                    v = parse_list_item(item)
                except (KeyError, TypeError, ValueError):
                    log.warning("habr: skip malformed item %s", item.get("id"))
                    continue
                if v.external_id in seen:
                    continue
                seen.add(v.external_id)
                out.append(v)
                if len(out) >= limit:
                    break
            page += 1

        detail_limit = int(getattr(self.settings, "habr_detail_limit", 30) or 0)
        for v in out[:detail_limit]:
            try:
                page_html = await http.fetch(self.key, v.url, min_interval=self.min_interval)
            except CollectorError as e:  # description is best-effort
                log.info("habr: detail fetch failed for %s: %s", v.external_id, e)
                continue
            desc = extract_description(page_html)
            if desc:
                v.description = desc
                v.payload = {**v.payload, "_detail": True}
        return out
