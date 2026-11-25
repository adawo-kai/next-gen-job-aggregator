"""Turns a source-specific RawVacancy into normalised fields + dedup fingerprint."""

from __future__ import annotations

import hashlib
import html
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.collectors.base import RawVacancy
from app.pipeline import skills as sk

GRADES = ["intern", "junior", "middle", "senior", "lead"]
FORMATS = ["remote", "hybrid", "office"]

_GRADE_PATTERNS = [
    ("lead", r"\b(team ?lead|tech ?lead|тимлид|техлид|lead|руководител\w+ (?:группы|отдела|направления)|head of|principal|ведущий)\b"),
    ("senior", r"\b(senior|сеньор|синьор|старший|sr\.?)\b"),
    ("middle", r"\b(middle\+?|мидл|middle/senior|mid)\b"),
    ("junior", r"\b(junior\+?|джуниор|джун|младший|jr\.?)\b"),
    ("intern", r"\b(intern|internship|стажер|стажёр|стажировк\w*|trainee|практикант)\b"),
]
_EXP_PATTERNS = [
    ("lead", r"от\s*(?:6|7|8|10)\s*(?:\+\s*)?(?:лет|года)"),
    ("senior", r"от\s*(?:4|5)\s*(?:\+\s*)?(?:лет|года)|(?:5|4)\+\s*years"),
    ("middle", r"от\s*(?:2|3)\s*(?:\+\s*)?(?:лет|года)|(?:2|3)\+\s*years"),
    ("junior", r"от\s*(?:1|0[,.]5)\s*(?:года|лет)|без опыта|no experience"),
]
_FORMAT_PATTERNS = [
    ("hybrid", r"гибрид\w*|hybrid|частично удал\w+"),
    ("remote", r"удал[её]нн?\w*|удал[её]нка|remote|из любой точки|дистанционн\w*"),
    ("office", r"\bв офисе\b|офис\b|office|on-?site"),
]
_TITLE_NOISE = re.compile(
    r"\b(senior|middle|junior|lead|intern|team ?lead|старший|ведущий|младший|стажер|стажёр|sr|jr|mid|"
    r"разработчик|developer|engineer|инженер|программист|специалист|вакансия|удаленно|remote|"
    r"hybrid|гибрид|офис|в команду|в компанию)\b|[\(\)\[\]\-–—/|,.:!+#@]",
    re.I | re.U,
)
_COMPANY_NOISE = re.compile(r"\b(ооо|оао|зао|пао|ао|ип|llc|inc|ltd|gmbh|group|групп|компания|company)\b|[\"«»'`.,]", re.I)


@dataclass(slots=True)
class Normalized:
    title: str
    norm_title: str
    company: str | None
    norm_company: str | None
    description_html: str
    description_text: str
    salary_from: int | None
    salary_to: int | None
    currency: str | None
    salary_gross: bool | None
    grade: str | None
    work_format: str | None
    city: str | None
    country: str | None
    skills: list[str] = field(default_factory=list)
    fingerprint: str = ""
    content_hash: str = ""
    published_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def strip_html(s: str) -> str:
    s = re.sub(r"<(br|/p|/li|/div|/h\d)\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<li[^>]*>", "• ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t ]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n", s).strip()


def norm_company(name: str | None) -> str | None:
    if not name:
        return None
    n = _COMPANY_NOISE.sub(" ", name.lower())
    n = re.sub(r"\s+", " ", n).strip()
    return n or None


def norm_title(title: str) -> str:
    t = _TITLE_NOISE.sub(" ", title.lower())
    t = re.sub(r"\s+", " ", t).strip()
    # canonicalise tech words so "питон" == "python"
    words = [(sk.canonical(w) or w).lower() for w in t.split()]
    return " ".join(sorted(set(words))) or title.lower()


def detect_grade(title: str, text: str, hint: str | None) -> str | None:
    if hint and hint.lower() in GRADES:
        return hint.lower()
    tl = title.lower()
    for g, pat in _GRADE_PATTERNS:
        if re.search(pat, tl, re.I):
            return g
    low = text.lower()
    for g, pat in _EXP_PATTERNS:
        if re.search(pat, low, re.I):
            return g
    for g, pat in _GRADE_PATTERNS:
        if re.search(pat, low[:400], re.I):
            return g
    return None


def detect_format(text: str, hint: str | None) -> str | None:
    if hint in FORMATS:
        return hint
    low = text.lower()
    for f, pat in _FORMAT_PATTERNS:
        if re.search(pat, low):
            return f
    return None


_CUR = {"rur": "RUB", "rub": "RUB", "руб": "RUB", "₽": "RUB", "usd": "USD", "$": "USD", "eur": "EUR", "€": "EUR", "kzt": "KZT", "₸": "KZT"}


def norm_currency(c: str | None) -> str | None:
    if not c:
        return None
    return _CUR.get(c.strip().lower(), c.strip().upper()[:3])


def fingerprint(norm_comp: str | None, ntitle: str, skills: list[str], grade: str | None = None) -> str:
    key = f"{norm_comp or '-'}|{grade or '-'}|{ntitle}|{','.join(sorted(s.lower() for s in skills[:5]))}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def repost_key(norm_comp: str | None, ntitle: str) -> str:
    """Stable across reposts: company + cleaned title only (skills/text are often edited)."""
    return hashlib.sha256(f"{norm_comp or '-'}|{ntitle}".encode()).hexdigest()[:32]


def content_hash(raw: RawVacancy) -> str:
    key = f"{raw.title}|{raw.company}|{raw.description}|{raw.salary_from}|{raw.salary_to}"
    return hashlib.sha256(key.encode()).hexdigest()


def normalize(raw: RawVacancy) -> Normalized:
    desc_text = strip_html(raw.description or "")
    full = f"{raw.title}\n{desc_text}"
    skills = sk.normalize_list(raw.skills_hint) if raw.skills_hint else []
    for s in sk.extract(full):
        if s not in skills:
            skills.append(s)
    sf, st = raw.salary_from, raw.salary_to
    if sf and st and sf > st:
        sf, st = st, sf
    ncomp = norm_company(raw.company)
    ntitle = norm_title(raw.title)
    city = (raw.city or "").strip() or None
    grade = detect_grade(raw.title, desc_text, raw.grade_hint)
    return Normalized(
        title=re.sub(r"\s+", " ", raw.title).strip()[:300],
        norm_title=ntitle,
        company=(raw.company or "").strip() or None,
        norm_company=ncomp,
        description_html=raw.description or "",
        description_text=desc_text,
        salary_from=sf,
        salary_to=st,
        currency=norm_currency(raw.currency) if (sf or st) else None,
        salary_gross=raw.salary_gross,
        grade=grade,
        work_format=detect_format(full, raw.work_format),
        city=city,
        country=raw.country,
        skills=skills[:25],
        fingerprint=fingerprint(ncomp, ntitle, skills, grade),
        content_hash=content_hash(raw),
        published_at=raw.published_at or datetime.now(UTC),
    )
