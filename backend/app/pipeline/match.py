"""Explainable Match Score between a candidate profile and a vacancy."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.pipeline.normalize import GRADES
from app.pipeline.textmatch import stop_word_hits

WEIGHTS = {"skills": 0.55, "grade": 0.15, "salary": 0.15, "format": 0.10, "stop_words": 0.05}


@dataclass
class ProfileView:
    skills: list[str]
    grade: str | None
    desired_salary_rub: int | None
    work_formats: list[str]
    stop_words: list[str]
    city: str | None = None


@dataclass
class VacancyView:
    title: str
    text: str
    tags: list[str]
    must_have: list[str]
    nice_to_have: list[str]
    grade: str | None
    salary_rub_from: int | None
    salary_rub_to: int | None
    work_format: str | None
    city: str | None = None


@dataclass
class MatchResult:
    score: int
    breakdown: list[dict] = field(default_factory=list)
    matched_skills: list[str] = field(default_factory=list)
    missing_must: list[str] = field(default_factory=list)
    missing_nice: list[str] = field(default_factory=list)


def compute(p: ProfileView, v: VacancyView) -> MatchResult:
    mine = {s.lower() for s in p.skills}
    must = v.must_have or v.tags[:8]
    nice = v.nice_to_have
    must_hit = [s for s in must if s.lower() in mine]
    nice_hit = [s for s in nice if s.lower() in mine]
    bd: list[dict] = []

    # skills: must-have weigh 3x nice-to-have
    denom = 3 * len(must) + len(nice)
    skill_score = (3 * len(must_hit) + len(nice_hit)) / denom if denom else 0.5
    bd.append({"factor": "skills", "weight": WEIGHTS["skills"], "score": round(skill_score, 3),
               "note": f"{len(must_hit)}/{len(must)} обязательных, {len(nice_hit)}/{len(nice)} желательных"})

    # grade: distance on the ladder
    if p.grade and v.grade and p.grade in GRADES and v.grade in GRADES:
        d = abs(GRADES.index(p.grade) - GRADES.index(v.grade))
        g = {0: 1.0, 1: 0.55}.get(d, 0.1)
        note = "грейд совпадает" if d == 0 else f"разница {d} ступ."
    else:
        g, note = 0.6, "грейд не указан"
    bd.append({"factor": "grade", "weight": WEIGHTS["grade"], "score": g, "note": note})

    # salary: vacancy upper bound vs desired
    if p.desired_salary_rub and (v.salary_rub_to or v.salary_rub_from):
        top = v.salary_rub_to or v.salary_rub_from
        ratio = top / p.desired_salary_rub
        sal = 1.0 if ratio >= 1 else max(0.0, (ratio - 0.6) / 0.4)
        note = f"до {top:,} ₽ при ожидании {p.desired_salary_rub:,} ₽".replace(",", " ")
    else:
        sal, note = 0.6, "зарплата неизвестна"
    bd.append({"factor": "salary", "weight": WEIGHTS["salary"], "score": round(sal, 3), "note": note})

    # format
    if p.work_formats and v.work_format:
        f = 1.0 if v.work_format in p.work_formats else (0.5 if v.work_format == "hybrid" else 0.0)
        note = "формат подходит" if f == 1 else f"формат: {v.work_format}"
    else:
        f, note = 0.7, "формат не указан"
    bd.append({"factor": "format", "weight": WEIGHTS["format"], "score": f, "note": note})

    # stop words: in the title/skills -> hard penalty; only in the description -> this factor only
    head_hits = stop_word_hits(p.stop_words, f"{v.title} {' '.join(v.tags)}")
    hits = head_hits or stop_word_hits(p.stop_words, v.text)
    sw = 0.0 if hits else 1.0
    bd.append({"factor": "stop_words", "weight": WEIGHTS["stop_words"], "score": sw,
               "note": ("стоп-слова: " + ", ".join(hits)) if hits else "стоп-слов нет"})

    total = sum(b["weight"] * b["score"] for b in bd)
    if head_hits:
        total *= 0.3
    return MatchResult(
        score=int(round(total * 100)),
        breakdown=bd,
        matched_skills=must_hit + [s for s in nice_hit if s not in must_hit],
        missing_must=[s for s in must if s.lower() not in mine],
        missing_nice=[s for s in nice if s.lower() not in mine],
    )
