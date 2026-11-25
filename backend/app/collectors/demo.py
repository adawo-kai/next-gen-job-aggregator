"""Demo / replay collector: serves a recorded synthetic dataset so the project works offline.

Records keep their original platform in ``source`` (hh / habr / telegram) so the UI shows
real platform badges; ``published_at`` is recomputed from ``days_ago`` relative to *now*.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.collectors.base import BaseCollector, CollectorError, RawVacancy, register

_HERE = Path(__file__).resolve().parent
_BACKEND = _HERE.parents[1]
DEFAULT_FIXTURE = _HERE / "fixtures" / "demo_vacancies.json"

_FIELDS = {
    "source", "external_id", "url", "title", "company", "description", "salary_from", "salary_to",
    "currency", "salary_gross", "city", "country", "work_format", "grade_hint", "skills_hint", "company_logo",
}


def resolve_fixture(path: str | None) -> Path:
    if path:
        p = Path(path)
        for cand in (p, Path.cwd() / p, _BACKEND / p):
            if cand.is_file():
                return cand
    return DEFAULT_FIXTURE


def record_to_vacancy(rec: dict[str, Any], now: datetime | None = None) -> RawVacancy:
    now = now or datetime.now(UTC)
    kwargs = {k: rec.get(k) for k in _FIELDS if k in rec}
    kwargs["skills_hint"] = list(rec.get("skills_hint") or [])
    days_ago = rec.get("days_ago")
    published = now - timedelta(days=float(days_ago)) if days_ago is not None else None
    payload = dict(rec.get("payload") or {})
    payload.setdefault("demo", True)
    payload["days_ago"] = days_ago
    return RawVacancy(published_at=published, payload=payload, **kwargs)


def load_records(path: Path) -> list[dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise CollectorError(f"demo: fixture not found: {path}") from e
    except json.JSONDecodeError as e:
        raise CollectorError(f"demo: bad fixture JSON {path}: {e}") from e
    if isinstance(data, dict):
        data = data.get("vacancies") or []
    return list(data)


@register("demo")
class DemoCollector(BaseCollector):
    title = "Demo dataset"
    min_interval = 0.0

    async def collect(self, limit: int = 100) -> list[RawVacancy]:
        path = resolve_fixture(getattr(self.settings, "demo_fixture_path", None))
        records = load_records(path)
        now = datetime.now(UTC)
        # freshest first so a small limit still gets a representative, recent slice
        records.sort(key=lambda r: r.get("days_ago", 0))
        return [record_to_vacancy(r, now) for r in records[: limit if limit else None]]
