"""Cross-platform deduplication.

Stage 1  exact fingerprint (company + cleaned title + key skills)            -> merge
Stage 2  candidate blocking in Postgres with pg_trgm on the cleaned title,
         same company (or unknown company), ±45 days
Stage 3  scoring in Python: title trigram sim, description char-trigram
         Jaccard, skill Jaccard, salary/city compatibility -> merge if >= threshold
Each merge stores a human-readable reason and score in ``vacancy_sources``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Vacancy
from app.pipeline.normalize import Normalized

MERGE_THRESHOLD = 0.62


@dataclass
class DedupDecision:
    vacancy: Vacancy | None
    reason: str
    score: float


def _trigrams(s: str) -> set[str]:
    s = re.sub(r"[^\w]+", " ", s.lower())
    s = f"  {s} "
    return {s[i: i + 3] for i in range(len(s) - 2)}


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def text_similarity(a: str, b: str, limit: int = 1500) -> float:
    return jaccard(_trigrams(a[:limit]), _trigrams(b[:limit]))


def salary_compatible(n: Normalized, v: Vacancy) -> float:
    """1.0 same/overlapping, 0.5 unknown, 0.0 clearly different."""
    if not (n.salary_from or n.salary_to) or not (v.salary_from or v.salary_to):
        return 0.5
    if (n.currency or "RUB") != (v.currency or "RUB"):
        return 0.5
    a1, a2 = n.salary_from or n.salary_to, n.salary_to or n.salary_from
    b1, b2 = v.salary_from or v.salary_to, v.salary_to or v.salary_from
    overlap = min(a2, b2) - max(a1, b1)
    return 1.0 if overlap >= -0.1 * max(a2, b2) else 0.0


def score_pair(n: Normalized, v: Vacancy, title_sim: float) -> tuple[float, str]:
    desc_sim = text_similarity(n.description_text, v.description_text)
    skill_sim = jaccard({s.lower() for s in n.skills[:12]}, {s.lower() for s in (v.tags or [])[:12]})
    sal = salary_compatible(n, v)
    same_city = 1.0 if (not n.city or not v.city or n.city.lower() == v.city.lower()) else 0.0
    score = 0.40 * title_sim + 0.25 * desc_sim + 0.20 * skill_sim + 0.10 * sal + 0.05 * same_city
    if sal == 0.0:
        score -= 0.15  # different salary => likely another position
    if desc_sim < 0.3:
        score -= 0.08  # same title but different text: often a sibling position
    if n.grade and v.grade and n.grade != v.grade:
        return 0.0, f"grade differs ({n.grade} vs {v.grade}) -> different position"
    reason = f"title {title_sim:.2f} · text {desc_sim:.2f} · skills {skill_sim:.2f} · salary {'ok' if sal == 1 else '?' if sal == .5 else '≠'}"
    return round(score, 3), reason


async def find_duplicate(session: AsyncSession, n: Normalized, company_id: int | None) -> DedupDecision:
    s = get_settings()
    window = timedelta(days=45)

    # Stage 1: exact fingerprint
    exact = await session.scalar(
        select(Vacancy).where(Vacancy.fingerprint == n.fingerprint).order_by(Vacancy.id).limit(1)
    )
    if exact is not None:
        return DedupDecision(exact, "exact fingerprint (company+title+skills)", 1.0)

    # Stage 2: blocking via pg_trgm
    sim = func.similarity(Vacancy.norm_title, n.norm_title)
    q = (
        select(Vacancy, sim.label("sim"))
        .where(sim >= s.dedup_title_similarity)
        .where(Vacancy.published_at.between(n.published_at - window, n.published_at + window))
        .order_by(sim.desc())
        .limit(8)
    )
    if company_id is not None:
        q = q.where(or_(Vacancy.company_id == company_id, Vacancy.company_id.is_(None)))
    rows = (await session.execute(q)).all()

    # Stage 3: scoring
    best: tuple[float, str, Vacancy] | None = None
    for v, title_sim in rows:
        sc, reason = score_pair(n, v, float(title_sim))
        if company_id is None or v.company_id is None:
            sc -= 0.05  # less evidence without company
        if best is None or sc > best[0]:
            best = (sc, reason, v)
    if best and best[0] >= MERGE_THRESHOLD:
        return DedupDecision(best[2], best[1], best[0])
    return DedupDecision(None, "origin", 1.0)
