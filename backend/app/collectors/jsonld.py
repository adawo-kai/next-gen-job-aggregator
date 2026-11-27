"""Generic collector for job boards that publish schema.org/JobPosting (JSON-LD) + a sitemap.

Polite by design: reads only URLs listed in the site's sitemap, honours the per-source rate limit,
fetches only postings modified recently, and maps the standard JobPosting fields — no HTML scraping
that breaks on redesigns. A new board = a subclass with sitemap URLs and a URL filter.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any, ClassVar

from dateutil import parser as dtparser

from app.collectors.base import BaseCollector, CollectorError, RawVacancy
from app.collectors.http import fetch

_LD_RE = re.compile(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', re.S | re.I)
_LOC_RE = re.compile(r"<url>\s*<loc>([^<]+)</loc>(?:\s*<lastmod>([^<]+)</lastmod>)?", re.S)

EMPLOYMENT = {"FULL_TIME": "full_time", "PART_TIME": "part_time", "CONTRACTOR": "contract", "INTERN": "intern"}


def parse_sitemap(xml: str) -> list[tuple[str, datetime | None]]:
    out = []
    for loc, lastmod in _LOC_RE.findall(xml):
        try:
            ts = dtparser.isoparse(lastmod) if lastmod else None
        except (ValueError, TypeError):
            ts = None
        out.append((loc.strip(), ts))
    return out


def _walk(node: Any):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def extract_job_postings(html: str) -> list[dict]:
    found = []
    for block in _LD_RE.findall(html):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        for node in _walk(data):
            t = node.get("@type")
            if t == "JobPosting" or (isinstance(t, list) and "JobPosting" in t):
                found.append(node)
    return found


def _first(v: Any) -> Any:
    return v[0] if isinstance(v, list) and v else v


def _num(v: Any) -> int | None:
    try:
        n = int(float(v))
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def posting_to_raw(source: str, jp: dict, fallback_url: str) -> RawVacancy | None:
    title = (jp.get("title") or "").strip()
    if not title:
        return None
    ident = _first(jp.get("identifier"))
    ext = str(ident.get("value")) if isinstance(ident, dict) and ident.get("value") else None
    url = jp.get("url") or fallback_url
    ext = ext or url
    org = _first(jp.get("hiringOrganization")) or {}
    company = org.get("name") if isinstance(org, dict) else None
    logo = org.get("logo") if isinstance(org, dict) else None
    if isinstance(logo, dict):
        logo = logo.get("url")

    sal_from = sal_to = None
    currency = None
    salary = _first(jp.get("baseSalary"))
    if isinstance(salary, dict):
        currency = salary.get("currency")
        val = salary.get("value")
        unit = "MONTH"
        if isinstance(val, dict):
            unit = (val.get("unitText") or "MONTH").upper()
            sal_from, sal_to = _num(val.get("minValue")), _num(val.get("maxValue"))
            if sal_from is None and sal_to is None:
                sal_from = sal_to = _num(val.get("value"))
        else:
            sal_from = sal_to = _num(val)
        if unit not in ("MONTH", ""):  # hourly/yearly salaries are not comparable with monthly ones
            factor = {"YEAR": 1 / 12, "HOUR": 168, "DAY": 21, "WEEK": 4.33}.get(unit)
            sal_from = int(sal_from * factor) if sal_from and factor else None
            sal_to = int(sal_to * factor) if sal_to and factor else None

    city = country = None
    loc = _first(jp.get("jobLocation"))
    if isinstance(loc, dict):
        addr = loc.get("address") or {}
        if isinstance(addr, dict):
            city = addr.get("addressLocality")
            c = addr.get("addressCountry")
            country = c.get("name") if isinstance(c, dict) else c
    remote = str(jp.get("jobLocationType", "")).upper() == "TELECOMMUTE"
    published = None
    if jp.get("datePosted"):
        try:
            published = dtparser.isoparse(jp["datePosted"])
        except (ValueError, TypeError):
            published = None
    skills = jp.get("skills")
    if isinstance(skills, str):
        skills = [s.strip() for s in re.split(r"[,;]", skills) if s.strip()]
    return RawVacancy(
        source=source,
        external_id=ext[:128],
        url=url,
        title=title[:300],
        company=company,
        description=jp.get("description") or "",
        published_at=published,
        salary_from=sal_from,
        salary_to=sal_to,
        currency=currency,
        city=city,
        country={"KG": "Кыргызстан", "KZ": "Казахстан", "RU": "Россия", "UZ": "Узбекистан"}.get(country, country),
        work_format="remote" if remote else None,
        skills_hint=skills if isinstance(skills, list) else [],
        company_logo=logo,
        payload={"jsonld": jp, "employment": [EMPLOYMENT.get(e, e) for e in (jp.get("employmentType") or [])]
                 if isinstance(jp.get("employmentType"), list) else jp.get("employmentType")},
    )


class JsonLdCollector(BaseCollector):
    """Subclasses set: sitemaps (callable returning sitemap URLs), url_filter, max_age_days."""

    min_interval: ClassVar[float] = 1.5
    max_age_days: ClassVar[int] = 21
    url_filter: ClassVar[re.Pattern[str]] = re.compile(r".*")

    def sitemap_urls(self) -> list[str]:  # pragma: no cover - overridden
        raise NotImplementedError

    async def discover(self, limit: int) -> list[tuple[str, datetime | None]]:
        """Vacancy URLs (+ lastmod). Default: the site's sitemaps; listing-page boards override this."""
        entries: list[tuple[str, datetime | None]] = []
        for sm in self.sitemap_urls():
            try:
                xml = await fetch(self.key, sm, min_interval=self.min_interval)
            except CollectorError:
                continue  # next month's sitemap may not exist yet
            entries += [(u, ts) for u, ts in parse_sitemap(xml) if self.url_filter.search(u)]
        return entries

    async def collect(self, limit: int = 100) -> list[RawVacancy]:
        since = datetime.now(UTC) - timedelta(days=self.max_age_days)
        entries = await self.discover(limit)
        if not entries:
            raise CollectorError(f"{self.key}: sitemap has no vacancy URLs")
        fresh = [(u, ts) for u, ts in entries if ts is None or ts >= since]
        fresh.sort(key=lambda e: e[1] or since, reverse=True)
        out: list[RawVacancy] = []
        for url, _ in fresh[:limit]:
            try:
                page = await fetch(self.key, url, min_interval=self.min_interval)
            except CollectorError:
                continue
            for jp in extract_job_postings(page)[:1]:
                raw = posting_to_raw(self.key, jp, url)
                if raw:
                    out.append(raw)
        return out
