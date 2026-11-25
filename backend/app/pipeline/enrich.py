"""AI enrichment: stack, grade, 3-part summary, red flags, water score.

Two interchangeable engines behind one function:
* ``LLMEnricher`` — Claude via tool use (strict JSON schema), validated by Pydantic,
  cached by content hash, cost-tracked, daily budget guard.
* ``RulesEnricher`` — deterministic fallback (regex + taxonomy). Works offline, no key needed.
If the LLM fails or the budget is exhausted the rules engine is used transparently.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.config import get_settings
from app.observability import LLM_CALLS, LLM_COST, log
from app.pipeline import skills as sk
from app.pipeline.normalize import GRADES, detect_grade

PROMPT_VERSION = "v3"


class RedFlag(BaseModel):
    code: str
    title: str
    evidence: str = ""


class Summary(BaseModel):
    what_to_do: list[str] = Field(default_factory=list, max_length=3)
    requirements: list[str] = Field(default_factory=list, max_length=3)
    conditions: list[str] = Field(default_factory=list, max_length=3)


class Enrichment(BaseModel):
    stack: list[str] = Field(default_factory=list)
    must_have: list[str] = Field(default_factory=list)
    nice_to_have: list[str] = Field(default_factory=list)
    grade: Literal["intern", "junior", "middle", "senior", "lead"] | None = None
    summary: Summary = Field(default_factory=Summary)
    red_flags: list[RedFlag] = Field(default_factory=list)
    water_score: int = Field(0, ge=0, le=100)
    method: Literal["llm", "rules"] = "rules"
    model: str = "rules-engine"


# --------------------------------------------------------------------------- rules
RED_FLAGS: list[tuple[str, str, str]] = [
    ("unpaid_test", "Неоплачиваемое объёмное тестовое", r"(тестов\w+ задани\w+[^.\n]{0,60}(не оплачива|бесплатн|на \d+\s*(?:дн|час)|объ[её]мн))|(неоплачиваем\w+ тестов)"),
    ("overtime", "Переработки", r"переработ\w+|ненормированн\w+|готовност\w+ работать в выходные|work hard|24/7|в режиме многозадачности"),
    ("stress", "«Стрессоустойчивость»", r"стрессоустойчив\w+|высок\w+ темп|быстро меняющ\w+ услови"),
    ("family", "«Мы — семья»", r"мы\s*[-—–]?\s*(одна\s*)?семья|как семья|дружн\w+ (коллектив|команд)"),
    ("vague", "Размытые обязанности", r"(и другие|иные|прочие) (задачи|обязанности)|выполнение поручений руководства|широкий круг задач"),
    ("grey_salary", "Серая зарплата", r"(серая|в конверте|часть зарплаты неофициально|оформление по гпх|самозанят)"),
    ("low_pay_trial", "Сниженная оплата на испытательном", r"(на испытательн\w+ срок\w*[^.\n]{0,40}(\d+\s*%|снижен|меньше))"),
    ("unicorn", "Требования «единорога»", r"(full ?stack[^.\n]{0,40}devops)|(знание всех)|(опыт от 5 лет[^.\n]{0,40}junior)"),
]
WATER_PHRASES = [
    "дружный коллектив", "молодой коллектив", "динамично развивающ", "амбициозн", "печеньки", "печенье",
    "кофе", "фрукты", "лидер рынка", "уникальная возможность", "карьерный рост", "интересные задачи",
    "комфортный офис", "стабильная компания", "белая зарплата", "своевременная выплата", "команда профессионалов",
    "нацелен на результат", "проактивн", "умение работать в команде", "ответственность", "коммуникабельн",
    "обучаемость", "желание развиваться", "ориентированность на результат", "крутые проекты", "мы ценим",
    "без бюрократии", "открытость", "настольный теннис", "плейстейшн", "playstation",
]
_SECTION_HEADERS = {
    "what_to_do": r"(задачи|обязанности|чем (?:предстоит|будешь|вы будете) заниматься|что (?:нужно|предстоит|будет) делать|responsibilities|what you.ll do)",
    "requirements": r"(требования|мы ждем|мы ждём|ожидаем|что (?:мы )?(?:ждем|ждём|нужно)|необходимо|requirements|you have|наши ожидания)",
    "nice": r"(будет плюсом|желательно|приветствуется|nice to have|преимуществом)",
    "conditions": r"(условия|мы предлагаем|что мы предлагаем|предлагаем|we offer|бонусы|benefits)",
}


def _sections(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {k: [] for k in _SECTION_HEADERS}
    current: str | None = None
    for raw_line in text.split("\n"):
        line = raw_line.strip(" •-–—*·\t")
        if not line:
            continue
        low = line.lower()
        hit = None
        if len(line) < 70:
            for key, pat in _SECTION_HEADERS.items():
                if re.match(rf"^\W*{pat}", low):
                    hit = key
                    break
        if hit:
            current = hit
            rest = re.sub(rf"^\W*{_SECTION_HEADERS[hit]}\W*", "", low, count=1)
            if len(rest) > 12:
                out[hit].append(line[len(line) - len(rest):].strip(" :"))
            continue
        if current and 6 < len(line) < 220:
            out[current].append(line)
    return out


def _clip(items: list[str], n: int = 3) -> list[str]:
    res = []
    for i in items:
        i = re.sub(r"\s+", " ", i).strip(" ;.")
        if i and i not in res:
            res.append(i[:140] + ("…" if len(i) > 140 else ""))
        if len(res) == n:
            break
    return res


def water_score(text: str, has_salary: bool, n_skills: int) -> int:
    low = text.lower()
    words = max(len(low.split()), 1)
    hits = sum(low.count(p) for p in WATER_PHRASES)
    density = hits / words * 100  # clichés per 100 words
    score = min(density * 12, 55)
    if not has_salary:
        score += 15
    if n_skills <= 1:
        score += 15
    elif n_skills <= 3:
        score += 7
    if words < 40:
        score += 10
    if re.search(r"(и другие|иные|прочие) (задачи|обязанности)", low):
        score += 8
    return int(max(0, min(100, round(score))))


def rules_enrich(title: str, text: str, skills_hint: list[str], has_salary: bool) -> Enrichment:
    full = f"{title}\n{text}"
    secs = _sections(text)
    stack = sk.normalize_list(skills_hint) + [s for s in sk.extract(full) if s not in skills_hint]
    stack = list(dict.fromkeys(stack))[:20]
    nice_text = "\n".join(secs["nice"])
    nice = [s for s in sk.extract(nice_text)] if nice_text else []
    must = [s for s in stack if s not in nice]
    flags: list[RedFlag] = []
    low = full.lower()
    for code, ttl, pat in RED_FLAGS:
        m = re.search(pat, low, re.I)
        if m:
            s = max(0, m.start() - 40)
            flags.append(RedFlag(code=code, title=ttl, evidence="…" + full[s: m.end() + 40].replace("\n", " ").strip() + "…"))
    summary = Summary(
        what_to_do=_clip(secs["what_to_do"]),
        requirements=_clip(secs["requirements"]) or [f"Стек: {', '.join(must[:5])}"] if must else _clip(secs["requirements"]),
        conditions=_clip(secs["conditions"]),
    )
    if not summary.what_to_do:
        sents = [s for s in re.split(r"(?<=[.!?])\s+|\n", text) if 20 < len(s) < 200]
        summary.what_to_do = _clip(sents, 2)
    return Enrichment(
        stack=stack,
        must_have=must[:12],
        nice_to_have=nice[:8],
        grade=detect_grade(title, text, None),
        summary=summary,
        red_flags=flags,
        water_score=water_score(text, has_salary, len(stack)),
        method="rules",
        model="rules-engine",
    )


# --------------------------------------------------------------------------- LLM
SYSTEM = (
    "Ты — аналитик IT-рынка труда. Тебе дают текст вакансии. Извлеки структурированные данные строго через "
    "инструмент save_vacancy_analysis. Правила: stack — только реальные технологии/инструменты (канонические "
    "названия: PostgreSQL, Kubernetes, React …), без soft skills. must_have — обязательные, nice_to_have — "
    "«будет плюсом». grade — определи по задачам, опыту и зарплате, даже если не указан в заголовке. summary — "
    "по 1–3 коротких пункта (до 100 символов) на русском: what_to_do, requirements, conditions. red_flags — "
    "только с цитатой-доказательством из текста (неоплачиваемое тестовое, переработки, размытые обязанности, "
    "серая зарплата, «мы семья», нереалистичные требования). water_score 0–100: доля шаблонных фраз и "
    "отсутствие конкретики (100 = одна вода)."
)

TOOL = {
    "name": "save_vacancy_analysis",
    "description": "Сохранить структурированный анализ вакансии",
    "input_schema": {
        "type": "object",
        "properties": {
            "stack": {"type": "array", "items": {"type": "string"}},
            "must_have": {"type": "array", "items": {"type": "string"}},
            "nice_to_have": {"type": "array", "items": {"type": "string"}},
            "grade": {"type": ["string", "null"], "enum": GRADES + [None]},
            "summary": {
                "type": "object",
                "properties": {
                    "what_to_do": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                    "requirements": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                    "conditions": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                },
                "required": ["what_to_do", "requirements", "conditions"],
            },
            "red_flags": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"code": {"type": "string"}, "title": {"type": "string"}, "evidence": {"type": "string"}},
                    "required": ["code", "title", "evidence"],
                },
            },
            "water_score": {"type": "integer", "minimum": 0, "maximum": 100},
        },
        "required": ["stack", "must_have", "nice_to_have", "grade", "summary", "red_flags", "water_score"],
    },
}

# USD per 1M tokens (input, output) — conservative defaults for budget guard
PRICES = {"haiku": (1.0, 5.0), "sonnet": (3.0, 15.0), "opus": (5.0, 25.0)}


@dataclass
class LLMResult:
    enrichment: Enrichment
    input_tokens: int
    output_tokens: int
    cost_usd: float


def _price(model: str) -> tuple[float, float]:
    for k, v in PRICES.items():
        if k in model:
            return v
    return PRICES["sonnet"]


async def llm_enrich(title: str, company: str | None, text: str) -> LLMResult:
    from anthropic import AsyncAnthropic

    s = get_settings()
    client = AsyncAnthropic(api_key=s.anthropic_api_key, max_retries=2, timeout=40)
    user_msg = f"Заголовок: {title}\nКомпания: {company or '—'}\n\nТекст вакансии:\n{text[:8000]}"
    last_err: Exception | None = None
    for attempt in range(2):  # one repair attempt on invalid JSON
        resp = await client.messages.create(
            model=s.llm_model,
            max_tokens=1200,
            system=SYSTEM,
            tools=[TOOL],
            tool_choice={"type": "tool", "name": TOOL["name"]},
            messages=[{"role": "user", "content": user_msg}],
        )
        block = next((b for b in resp.content if b.type == "tool_use"), None)
        try:
            if block is None:
                raise ValueError("no tool_use block")
            data = dict(block.input)
            data["stack"] = sk.normalize_list(data.get("stack", []))
            data["must_have"] = sk.normalize_list(data.get("must_have", []))
            data["nice_to_have"] = sk.normalize_list(data.get("nice_to_have", []))
            enr = Enrichment(**data, method="llm", model=s.llm_model)
        except (ValidationError, ValueError, TypeError) as e:
            last_err = e
            user_msg += "\n\n(Предыдущий ответ не прошёл валидацию схемы, будь строже.)"
            continue
        pin, pout = _price(s.llm_model)
        cost = resp.usage.input_tokens / 1e6 * pin + resp.usage.output_tokens / 1e6 * pout
        LLM_COST.inc(cost)
        return LLMResult(enr, resp.usage.input_tokens, resp.usage.output_tokens, cost)
    raise RuntimeError(f"LLM output invalid: {last_err}")


async def enrich(
    title: str, company: str | None, text: str, skills_hint: list[str], has_salary: bool, allow_llm: bool
) -> tuple[Enrichment, LLMResult | None]:
    s = get_settings()
    if allow_llm and s.anthropic_api_key:
        try:
            res = await llm_enrich(title, company, text)
            LLM_CALLS.labels("llm", "ok").inc()
            # rules are good at catching things LLM may drop (cheap ensemble)
            rules = rules_enrich(title, text, skills_hint, has_salary)
            for st in rules.stack:
                if st not in res.enrichment.stack and st in sk.TAXONOMY:
                    res.enrichment.stack.append(st)
            return res.enrichment, res
        except Exception as e:
            LLM_CALLS.labels("llm", "error").inc()
            log.warning("llm_enrich_failed_fallback_rules", error=str(e)[:300])
    LLM_CALLS.labels("rules", "ok").inc()
    return rules_enrich(title, text, skills_hint, has_salary), None
