"""hh.ru collector (official API). Anonymous access returns 403 now -> needs an OAuth token."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from dateutil import parser as dtparser

from app.collectors import http
from app.collectors.base import BaseCollector, CollectorError, RawVacancy, register

log = logging.getLogger(__name__)

API = "https://api.hh.ru/vacancies"
#: IT professional roles: 96 программист, 104 руководитель группы разработки, 165 data scientist,
#: 113 менеджер продукта, 112 сетевой инженер, 124 тестировщик, 125 технический писатель,
#: 160 DevOps, 10 аналитик, 156 BI-аналитик, 150 бизнес-аналитик, 164 продуктовый аналитик
IT_ROLES = [96, 104, 165, 113, 112, 124, 125, 160, 10, 156, 150, 164]
PER_PAGE = 100

CURRENCY_MAP = {"RUR": "RUB", "RUB": "RUB", "USD": "USD", "EUR": "EUR", "KZT": "KZT", "BYR": "BYN", "UZS": "UZS", "UAH": "UAH"}
SCHEDULE_MAP = {"remote": "remote", "flexible": "hybrid", "fullDay": "office", "shift": "office", "flyInFlyOut": "office"}
WORK_FORMAT_MAP = {"REMOTE": "remote", "HYBRID": "hybrid", "ON_SITE": "office", "FIELD_WORK": "office"}
EXPERIENCE_MAP = {"noExperience": "junior", "between1And3": "middle", "between3And6": "senior", "moreThan6": "lead"}


def _dt(v: str | None) -> datetime | None:
    if not v:
        return None
    try:
        return dtparser.isoparse(v)
    except (ValueError, TypeError):
        return None


def map_work_format(item: dict[str, Any]) -> str | None:
    # newer API field: work_format [{id: REMOTE|HYBRID|ON_SITE}]
    for wf in item.get("work_format") or []:
        if wf.get("id") in WORK_FORMAT_MAP:
            return WORK_FORMAT_MAP[wf["id"]]
    sched = (item.get("schedule") or {}).get("id")
    return SCHEDULE_MAP.get(sched) if sched else None


def parse_item(item: dict[str, Any]) -> RawVacancy:
    """Map an hh.ru vacancy (search item or detail) to RawVacancy (pure)."""
    salary = item.get("salary_range") or item.get("salary") or {}
    employer = item.get("employer") or {}
    snippet = item.get("snippet") or {}
    area = item.get("area") or {}
    desc = item.get("description")
    if not desc:
        parts = []
        if snippet.get("responsibility"):
            parts.append("Обязанности: " + snippet["responsibility"])
        if snippet.get("requirement"):
            parts.append("Требования: " + snippet["requirement"])
        desc = "\n".join(parts) or (item.get("name") or "")
    cur = salary.get("currency")
    logos = employer.get("logo_urls") or {}
    address = item.get("address") or {}
    return RawVacancy(
        source="hh",
        external_id=str(item["id"]),
        url=item.get("alternate_url") or f"https://hh.ru/vacancy/{item['id']}",
        title=(item.get("name") or "").strip(),
        company=employer.get("name"),
        description=desc,
        published_at=_dt(item.get("published_at") or item.get("created_at")),
        salary_from=salary.get("from"),
        salary_to=salary.get("to"),
        currency=CURRENCY_MAP.get(cur, cur) if cur else None,
        salary_gross=salary.get("gross"),
        city=area.get("name") or address.get("city"),
        country=None,
        work_format=map_work_format(item),
        grade_hint=EXPERIENCE_MAP.get((item.get("experience") or {}).get("id") or ""),
        skills_hint=[s["name"] for s in item.get("key_skills") or [] if s.get("name")],
        company_logo=logos.get("240") or logos.get("90") or logos.get("original"),
        payload=item,
    )


@register("hh")
class HHCollector(BaseCollector):
    title = "hh.ru"
    min_interval = 0.4

    def enabled(self) -> bool:
        return bool(getattr(self.settings, "hh_access_token", None))

    def _headers(self) -> dict[str, str]:
        email = getattr(self.settings, "hh_contact_email", None) or "dev@example.com"
        ua = f"NextGenJobAggregator/1.0 ({email})"
        return {
            "Authorization": f"Bearer {self.settings.hh_access_token}",
            "HH-User-Agent": ua,
            "User-Agent": ua,
        }

    async def collect(self, limit: int = 100) -> list[RawVacancy]:
        if not self.enabled():
            raise CollectorError("hh: hh_access_token is not configured (anonymous API returns 403)")
        text = getattr(self.settings, "hh_query", "") or ""
        detail_limit = int(getattr(self.settings, "hh_detail_limit", 0) or 0)
        out: list[RawVacancy] = []
        page, pages = 0, 1
        per_page = min(PER_PAGE, max(limit, 1))
        while len(out) < limit and page < pages and page < 20:  # API caps depth at 2000 items
            params: list[tuple[str, Any]] = [("per_page", per_page), ("page", page), ("order_by", "publication_time")]
            if text:
                params.append(("text", text))
            params += [("professional_role", r) for r in IT_ROLES]
            data = await http.fetch(
                self.key, API, params=params, headers=self._headers(), min_interval=self.min_interval, as_json=True
            )
            pages = int(data.get("pages") or 0)
            for item in data.get("items") or []:
                try:
                    out.append(parse_item(item))
                except (KeyError, TypeError):
                    continue
                if len(out) >= limit:
                    break
            page += 1

        for v in out[:detail_limit]:  # full description + key_skills (1 request per vacancy)
            try:
                d = await http.fetch(
                    self.key, f"{API}/{v.external_id}", headers=self._headers(), min_interval=self.min_interval, as_json=True
                )
            except CollectorError as e:
                log.info("hh: detail %s failed: %s", v.external_id, e)
                continue
            full = parse_item(d)
            v.description, v.skills_hint, v.payload = full.description, full.skills_hint, d
        return out
