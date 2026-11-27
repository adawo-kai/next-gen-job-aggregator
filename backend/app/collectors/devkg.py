"""DevKG (devkg.com) — the main IT job board of Kyrgyzstan.

robots.txt allows vacancy pages; we read the monthly job sitemaps and the JobPosting JSON-LD of
Russian-language pages only (each posting also exists in /en and Kyrgyz versions).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from app.collectors.base import register
from app.collectors.jsonld import JsonLdCollector


@register("devkg")
class DevKGCollector(JsonLdCollector):
    title = "DevKG"
    url_filter = re.compile(r"^https://devkg\.com/ru/vakansiya-")

    def sitemap_urls(self) -> list[str]:
        now = datetime.now(UTC)
        # current and previous month: postings stay open for weeks
        y, m = (now.year, now.month - 1) if now.month > 1 else (now.year - 1, 12)
        return [f"https://devkg.com/sitemap-jobs-{now:%Y-%m}.xml", f"https://devkg.com/sitemap-jobs-{y}-{m:02d}.xml"]
