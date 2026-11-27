from __future__ import annotations

from app.models import User, Vacancy
from app.pipeline.currency import from_rub, to_rub
from app.pipeline.match import ProfileView, VacancyView, compute

SOURCE_TITLES = {"hh": "hh.ru", "habr": "Habr Карьера", "telegram": "Telegram", "devkg": "DevKG", "demo": "Demo"}


def profile_view(u: User, rates: dict[str, float]) -> ProfileView:
    return ProfileView(
        skills=u.skills or [], grade=u.grade,
        desired_salary_rub=to_rub(u.desired_salary, u.currency, rates) if u.desired_salary else None,
        work_formats=u.work_formats or [], stop_words=u.stop_words or [], city=u.city,
    )


def vacancy_view(v: Vacancy) -> VacancyView:
    return VacancyView(
        title=v.title, text=v.description_text or "", tags=v.tags or [], must_have=v.must_have or [],
        nice_to_have=v.nice_to_have or [], grade=v.grade, salary_rub_from=v.salary_rub_from,
        salary_rub_to=v.salary_rub_to, work_format=v.work_format, city=v.city,
    )


def match_score(u: User | None, v: Vacancy, rates) -> int | None:
    if u is None or not (u.skills or u.grade):
        return None
    return compute(profile_view(u, rates), vacancy_view(v)).score


def _platforms(v: Vacancy) -> list[dict]:
    """Each platform once (latest link); reposts on the same platform are history, not sources."""
    seen: set[str] = set()
    out = []
    for link in sorted(v.links, key=lambda x: x.published_at, reverse=True):
        if link.source in seen:
            continue
        seen.add(link.source)
        out.append({"source": link.source, "url": link.url, "published_at": link.published_at.isoformat()})
    return out


def card(v: Vacancy, rates: dict[str, float], display_currency: str = "RUB", match: int | None = None) -> dict:
    disp = (display_currency or "RUB").upper()
    return {
        "id": v.id,
        "title": v.title,
        "company": {
            "id": v.company.id if v.company else None,
            "name": v.company.name if v.company else "Компания не указана",
            "trust_score": v.company.trust_score if v.company else 50,
            "logo_url": v.company.logo_url if v.company else None,
        },
        "salary": {
            "from": v.salary_from, "to": v.salary_to, "currency": v.currency or "RUB",
            "rub_from": v.salary_rub_from, "rub_to": v.salary_rub_to,
            "converted_from": from_rub(v.salary_rub_from, disp, rates),
            "converted_to": from_rub(v.salary_rub_to, disp, rates),
            "display_currency": disp, "estimated": bool(v.salary_estimated), "gross": v.salary_gross,
        },
        "grade": v.grade, "format": v.work_format, "city": v.city, "country": v.country,
        "tags": (v.tags or [])[:12],
        "sources": _platforms(v),
        "published_at": v.published_at.isoformat(),
        "first_seen_at": v.first_seen_at.isoformat() if v.first_seen_at else v.published_at.isoformat(),
        "water_score": v.water_score or 0,
        "red_flags": v.red_flags or [],
        "is_ghost": bool(v.is_ghost), "ghost_reason": v.ghost_reason,
        "repost_count": v.repost_count or 0,
        "match_score": match,
        "summary": v.summary,
    }


def detail(v: Vacancy, rates, display_currency="RUB", match=None, market=None) -> dict:
    d = card(v, rates, display_currency, match)
    links = sorted(v.links, key=lambda x: x.published_at)
    d.update(
        {
            "description_html": v.description_html or "",
            "description_text": v.description_text or "",
            "must_have": v.must_have or [],
            "nice_to_have": v.nice_to_have or [],
            "enrichment": {
                **(v.enrichment or {"model": "pending", "method": "rules", "prompt_version": "-"}),
                "enriched_at": v.enriched_at.isoformat() if v.enriched_at else None,
            },
            "dedup": {
                "cluster_size": len(links),
                "merged": [
                    {"source": x.source, "url": x.url, "reason": x.merge_reason, "score": round(x.merge_score, 3),
                     "published_at": x.published_at.isoformat()}
                    for x in links
                ],
            },
            "salary_market": market,
        }
    )
    return d
