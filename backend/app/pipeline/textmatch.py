"""Text matching helpers shared by search, stop-words and match scoring.

* Cyrillic/Latin look-alikes: "1С" (Cyrillic С) and "1C" (Latin C) are the same thing to a human.
* Crude Russian stemming for stop-words: "стажировка" also hides "стажировки", "стажировку".
* Synonyms for the most common stop-words and transliterations for search ("пайтон" -> Python).
"""

from __future__ import annotations

import re

from app.pipeline import skills as sk

_CYR2LAT = str.maketrans("аАвВеЕкКмМнНоОрРсСтТуУхХ", "aABBeEkKmMHHoOpPcCTTyYxX")
_LAT2CYR = str.maketrans("aAbBeEkKmMHoOpPcCTyYxX", "аАвВеЕкКмМНоОрРсСТуУхХ")

STOP_SYNONYMS: dict[str, list[str]] = {
    "стажировка": ["стажир", "стажер", "стажёр", "intern", "trainee"],
    "стажер": ["стажир", "стажёр", "intern", "trainee"],
    "1с": ["1c"],
    "битрикс": ["bitrix"],
    "офис": ["office", "on-site", "onsite"],
    "продажи": ["sales", "продаж"],
    "gamedev": ["геймдев", "game dev"],
}


def lookalike_variants(word: str) -> set[str]:
    w = word.strip().lower()
    if not w:
        return set()
    return {w, w.translate(_CYR2LAT).lower(), w.translate(_LAT2CYR).lower()}


def _stem(word: str) -> str:
    """Cut Russian endings so one form hides the others (стажировка -> стажиров)."""
    if re.fullmatch(r"[а-яё]{6,}", word):
        return re.sub(r"(ами|ями|ах|ях|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ые|ие|ом|ем|ам|ям|а|я|о|е|ы|и|у|ю|ь)$", "", word)
    return word


def stop_word_terms(word: str) -> list[str]:
    """All substrings that should trigger a stop-word (lower-case)."""
    base = word.strip().lower()
    if not base:
        return []
    terms: set[str] = set()
    for v in lookalike_variants(base):
        terms.add(_stem(v))
        for syn in STOP_SYNONYMS.get(v, []):
            terms |= lookalike_variants(syn)
    return sorted(t for t in terms if len(t) >= 2)


def stop_word_hits(stop_words: list[str], text: str) -> list[str]:
    low = text.lower()
    return [w for w in stop_words if w.strip() and any(t in low for t in stop_word_terms(w))]


def search_tokens(q: str) -> list[str]:
    """Split a query keeping tech tokens intact: c++, c#, .net, node.js, ci/cd."""
    return [t for t in re.findall(r"[\w.+#/-]+", q.lower()) if t.strip(".-/")]


def token_canonical(token: str) -> str | None:
    """Skill behind a token, also for transliterations/typos people type (пайтон, джава, с++)."""
    for v in lookalike_variants(token):
        if c := sk.canonical(v):
            return c
    return None
