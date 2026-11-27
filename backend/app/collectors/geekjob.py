"""GeekJob (geekjob.ru) — IT job board. robots.txt allows /vacancy/ pages (only /json/ and /rest/ are closed).

Discovery walks the public listing pages (newest first); each vacancy page carries schema.org JobPosting.
Non-IT postings (the board also has marketing/sales roles) are dropped later by the relevance gate.
"""

from __future__ import annotations

import re
from datetime import datetime

from app.collectors.base import CollectorError, register
from app.collectors.http import fetch
from app.collectors.jsonld import JsonLdCollector

_LINK = re.compile(r'href="(/vacancy/[a-f0-9]{24})"')


def listing_links(page_html: str) -> list[str]:
    seen: dict[str, None] = {}
    for path in _LINK.findall(page_html):
        seen.setdefault(f"https://geekjob.ru{path}", None)
    return list(seen)


@register("geekjob")
class GeekJobCollector(JsonLdCollector):
    title = "GeekJob"
    max_pages = 8  # ~20 postings per page, newest first; a 20-minute schedule needs only the first pages

    async def discover(self, limit: int) -> list[tuple[str, datetime | None]]:
        urls: list[str] = []
        for page in range(1, self.max_pages + 1):
            url = "https://geekjob.ru/vacancies" if page == 1 else f"https://geekjob.ru/vacancies/{page}"
            try:
                html = await fetch(self.key, url, min_interval=self.min_interval)
            except CollectorError:
                break
            links = listing_links(html)
            if not links:
                break
            urls += [u for u in links if u not in urls]
            if len(urls) >= limit:
                break
        return [(u, None) for u in urls]
