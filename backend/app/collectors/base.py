"""Collector plugin contract.

A new source = one module with a class decorated by ``@register("key")``.
The core never imports concrete collectors directly; it asks the registry.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, ClassVar


@dataclass(slots=True)
class RawVacancy:
    """Source-agnostic vacancy as fetched; normalisation happens later in the pipeline."""

    source: str  # registry key: hh | habr | telegram | demo
    external_id: str  # stable id inside the source
    url: str
    title: str
    company: str | None
    description: str  # plain text or HTML, pipeline strips tags
    published_at: datetime | None = None
    salary_from: int | None = None
    salary_to: int | None = None
    currency: str | None = None  # ISO-ish: RUB, USD, EUR, KZT ...
    salary_gross: bool | None = None
    city: str | None = None
    country: str | None = None
    work_format: str | None = None  # remote | hybrid | office
    grade_hint: str | None = None  # source-provided grade if any
    skills_hint: list[str] = field(default_factory=list)  # source-provided tags
    company_logo: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)  # untouched raw response -> JSONB


class CollectorError(Exception):
    """Raised for source-level failures (blocked, bad response, auth)."""


class BaseCollector(abc.ABC):
    key: ClassVar[str]
    title: ClassVar[str]
    #: minimum seconds between HTTP requests to this source (enforced by the http helper)
    min_interval: ClassVar[float] = 1.0

    def __init__(self, settings: Any) -> None:
        self.settings = settings

    def enabled(self) -> bool:  # pragma: no cover - trivial
        return True

    @abc.abstractmethod
    async def collect(self, limit: int = 100) -> list[RawVacancy]:
        """Fetch fresh vacancies. Must raise CollectorError on source failure."""


_REGISTRY: dict[str, type[BaseCollector]] = {}


def register(key: str):
    def deco(cls: type[BaseCollector]) -> type[BaseCollector]:
        cls.key = key
        _REGISTRY[key] = cls
        return cls

    return deco


def registry() -> dict[str, type[BaseCollector]]:
    # import side effects register built-in collectors
    from app.collectors import demo, habr, hh, telegram  # noqa: F401

    return dict(_REGISTRY)
