"""Telegram channels collector.

Default transport: public web preview ``https://t.me/s/<channel>`` (no auth).
All text heuristics are pure functions so they can be unit-tested offline.
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from dateutil import parser as dtparser
from selectolax.lexbor import LexborHTMLParser

from app.collectors import http
from app.collectors.base import BaseCollector, CollectorError, RawVacancy, register

log = logging.getLogger(__name__)

#: verified 2026-11 to be public, alive and posting IT vacancies
DEFAULT_CHANNELS = ["job_python", "it_vakansii_jobs", "getitrussia", "forproducts", "jobforjunior", "datasciencejobs"]

# --------------------------------------------------------------------------- text helpers
_EMOJI_RE = re.compile(
    "[\U0001f000-\U0001faff☀-➿⬀-⯿⌀-⏿←-⇿─-╿"
    "■-◿️‍⃣•·]+"
)
_HASHTAG_RE = re.compile(r"#([\w+\-#.]+)", re.U)
_WS_RE = re.compile(r"\s+")


def strip_emoji(s: str) -> str:
    return _EMOJI_RE.sub(" ", s)


def clean_line(line: str) -> str:
    s = strip_emoji(line)
    s = _HASHTAG_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip(" \t-–—:|•*_>")
    return s


def extract_hashtags(text: str) -> list[str]:
    seen: dict[str, None] = {}
    for tag in _HASHTAG_RE.findall(text):
        tag = tag.strip(".-")
        if tag:
            seen.setdefault(tag, None)
    return list(seen)


# --------------------------------------------------------------------------- vacancy detection
_VACANCY_KW = re.compile(
    r"ваканси|ищем|ищу|требовани|обязанност|задачи|услови|зарплат|з/п|\bзп\b|вилка|оклад|"
    r"оформлени|опыт работы|откликнуться|резюме|hiring|we are looking|job opportunity|"
    r"requirements|responsibilities|salary|apply|stack|стек|"
    r"разработчик|developer|engineer|инженер|аналитик|analyst|тестировщик|\bqa\b|devops|"
    r"дизайнер|designer|менеджер|manager|тимлид|team ?lead|архитектор|architect|программист|стажир|intern",
    re.I,
)
_STRONG_KW = re.compile(
    r"ваканси|требовани|обязанност|ищем|зарплат|з/п|\bзп\b|вилка|оклад|hiring|job opportunity|"
    r"requirements|responsibilities|salary|company:|компания:|формат работы",
    re.I,
)
_NON_VACANCY = re.compile(
    r"\berid\b|реклама\.|открыт\w* урок|вебинар|интенсив|курс\w*\b.*(?:скидк|запис)|розыгрыш|"
    r"дайджест|подборк|собеседование с техлидом|мок-собеседован|подписывайтесь|resume review|подкаст|"
    r"за \d+ недел|эфир\b|стрим\b|читайте|в нашей статье|бесплатн\w* урок",
    re.I,
)
_ROLE_KW = re.compile(
    r"разработчик|developer|engineer|инженер|аналитик|analyst|тестировщик|\bqa\b|\baqa\b|devops|sre\b|"
    r"дизайнер|designer|менеджер|manager|\blead\b|лид\b|тимлид|архитектор|architect|программист|"
    r"scientist|администратор|admin|специалист|specialist|руководитель|head of|cto\b|"
    r"стажер|стажёр|intern|junior|middle|senior|рекрутер|recruiter|маркетолог|product|продакт|"
    r"методолог|консультант|consultant|owner|оператор|верстальщик|1с|1c|frontend|backend|fullstack|"
    r"python|java\b|golang|go\b|php|c\+\+|c#|\.net|ios|android|ml\b",
    re.I,
)
_HEADER_LINE = re.compile(
    r"^(?:#?\s*)?(?:job opportunity|new job|hiring|we are hiring|ваканси[яи]|новая ваканси[яи]|"
    r"срочно|горячая ваканси[яи]|работа|ищем|открыта ваканси[яи])[\s!:.]*$",
    re.I,
)
_TITLE_PREFIX = re.compile(r"^(?:ваканси[яи]|position|role|позиция|должность|job|title)\s*[:\-–—]\s*", re.I)
_SEEK_PREFIX = re.compile(r"^(?:.{0,60}?\s)?(?:ищем|ищет|ищу|требуется|требуются|нужен|нужна|looking for|hiring)\s+", re.I)
_FIELD_LINE = re.compile(
    r"^(?:локация|location|формат\w*|format|зп|з/п|зарплата|salary|грейд|grade|опыт|experience|занятость|"
    r"график|город|тип|employment|оплата|вилка|уровень|level|стек|stack|languages?|языки?)\b[^:]{0,20}:",
    re.I,
)


def is_vacancy(text: str) -> bool:
    if not text or len(text) < 40:
        return False
    if _NON_VACANCY.search(text):
        return False
    if is_digest(text):
        return False
    hits = len(_VACANCY_KW.findall(text))
    return bool(_STRONG_KW.search(text)) and hits >= 2 or hits >= 4


def is_digest(text: str) -> bool:
    """Posts listing many vacancies as one-liners ('X в Y. Удалённо.') — not a single vacancy."""
    lines = [clean_line(x) for x in text.splitlines()]
    roleish = [ln for ln in lines if ln and len(ln) < 90 and re.search(r"\sв\s+[A-ZА-ЯЁ0-9«\"]", ln) and _ROLE_KW.search(ln)]
    has_body = re.search(r"требовани|обязанност|задачи|requirements|responsibilit", text, re.I)
    return len(roleish) >= 4 and not has_body


# --------------------------------------------------------------------------- title / company
_COMPANY_LINE = re.compile(
    r"^(?:компания|company|работодатель|employer|организация|заказчик)\s*[:\-–—]\s*(.+)$", re.I
)
_IN_COMPANY = re.compile(r"\s(?:в|at|@)\s+(?:компани[юия]\s+)?([«\"]?[A-ZА-ЯЁ0-9][\w.\-&«»\"' ]{0,40}?)[»\"]?(?:\s*[—–\-(.,|]|$)")


def extract_title(text: str) -> str:
    lines = [clean_line(x) for x in text.splitlines()]
    lines = [ln for ln in lines if ln and len(ln) > 2]
    candidates: list[str] = []
    for ln in lines[:8]:
        if _HEADER_LINE.match(ln) or _COMPANY_LINE.match(ln) or _FIELD_LINE.match(ln):
            continue
        ln = _TITLE_PREFIX.sub("", ln).strip()
        stripped = _SEEK_PREFIX.sub("", ln).strip()
        if stripped and stripped != ln and _ROLE_KW.search(stripped):
            ln = stripped[0].upper() + stripped[1:]
        if not ln:
            continue
        candidates.append(ln)
    if not candidates:
        return (lines[0] if lines else "Вакансия")[:150]
    title = next((c for c in candidates[:5] if _ROLE_KW.search(c) and len(c) <= 160), candidates[0])
    # "Product Manager в Ингосстрах — крупная компания..." -> keep the head part
    title = re.split(r"\s[—–]\s|\s-\s(?=[а-яa-z])", title, maxsplit=1)[0].strip()
    return title[:150].rstrip(" .,;")


def split_title_company(title: str) -> tuple[str, str | None]:
    """'Продуктовый маркетолог в Контур' -> ('Продуктовый маркетолог', 'Контур')."""
    m = _IN_COMPANY.search(title)
    if not m:
        return title, None
    company = m.group(1).strip(" «»\"'")
    low = company.lower()
    if not company or low.startswith(("команд", "отдел", "направлени", "проект", "офис", "москв", "спб")):
        return title, None
    head = title[: m.start()].strip(" ,")
    if not head:
        return title, None
    return head, company


def company_before_title(text: str, title: str) -> str | None:
    """Short bold-ish line right above the title is often the employer ('Группа Rubytech')."""
    lines = [clean_line(x) for x in text.splitlines()]
    lines = [ln for ln in lines if ln]
    head = title[:25]
    for i, ln in enumerate(lines[:8]):
        if head and head in ln and i > 0:
            prev = lines[i - 1]
            if (
                len(prev) <= 40
                and prev[:1].isupper()
                and not _ROLE_KW.search(prev)
                and not _HEADER_LINE.match(prev)
                and not _FIELD_LINE.match(prev)
                and not _VACANCY_KW.search(prev)
                and not prev.endswith((".", "!", "?"))
            ):
                return prev
            return None
    return None


def extract_company(text: str, title: str | None = None) -> str | None:
    for raw in text.splitlines():
        ln = clean_line(raw)
        m = _COMPANY_LINE.match(ln)
        if m:
            val = m.group(1).strip(" .")
            if val:
                return val[:80]
            # value on the next line ("Компания:\nКонтур")
    lines = [clean_line(x) for x in text.splitlines()]
    for i, ln in enumerate(lines):
        if re.fullmatch(r"(?:компания|company|работодатель)\s*:?", ln, re.I):
            nxt = next((x for x in lines[i + 1 : i + 3] if x), None)
            if nxt:
                return nxt[:80]
    if title:
        _, comp = split_title_company(title)
        if comp:
            return comp
    m = re.search(r"\bв\s+компани[юи]\s+[«\"]?([A-ZА-ЯЁ][\w.\-& ]{1,40}?)[»\"]?(?=[\s,.!—–]|$)", text)
    if m:
        return m.group(1).strip()
    return None


# --------------------------------------------------------------------------- salary
_NUM = r"\d{1,3}(?:[   .,]\d{3})+|\d+(?:[.,]\d+)?"
_K = r"(?:к|k|тыс\.?|т\.р\.?|тр)(?![a-zа-яё])"
_CUR = (
    r"(?:₽|\$|€|₸|руб(?:лей|ля|\.)?(?![a-zа-яё])|р\.(?![a-zа-яё])|rub(?![a-z])|rur(?![a-z])|usd(?![a-z])|"
    r"eur(?![a-z])|евро(?![a-zа-яё])|долл(?:аров|ара|\.)?(?![a-zа-яё])|тенге(?![a-zа-яё])|kzt(?![a-z])|usdt(?![a-z]))"
)
_SALARY_RE = re.compile(
    rf"(?P<pre>\bот\b|\bдо\b|\bfrom\b|\bup\s+to\b)?\s*(?P<c1>{_CUR})?\s*(?P<a1>{_NUM})\s*(?P<k1>{_K})?\s*(?P<c2>{_CUR})?"
    rf"(?:\s*(?:-|–|—|\bдо\b|\bto\b)\s*(?P<c3>{_CUR})?\s*(?P<a2>{_NUM})\s*(?P<k2>{_K})?\s*(?P<c4>{_CUR})?)?",
    re.I,
)
_SALARY_KW = re.compile(r"зарплат|з/п|\bзп\b|вилк|оклад|доход|salary|compensation|ставк|rate|net|gross|на руки", re.I)
_NOT_MONEY = re.compile(r"rps|qps|rpm|пользовател|users|запрос|строк|клиент|подписчик|DAU|MAU|сотрудник", re.I)
_PER_HOUR = re.compile(r"/\s*(?:час|ч\b|hour|hr)|в час|per hour", re.I)

_CUR_NORMAL = {
    "₽": "RUB", "руб": "RUB", "р.": "RUB", "rub": "RUB", "rur": "RUB",
    "$": "USD", "usd": "USD", "долл": "USD", "usdt": "USD",
    "€": "EUR", "eur": "EUR", "евро": "EUR",
    "₸": "KZT", "тенге": "KZT", "kzt": "KZT",
}
_PLAUSIBLE = {"RUB": (15_000, 5_000_000), "USD": (300, 60_000), "EUR": (300, 60_000), "KZT": (80_000, 30_000_000)}


@dataclass(slots=True)
class Salary:
    salary_from: int | None = None
    salary_to: int | None = None
    currency: str | None = None
    gross: bool | None = None
    raw: str | None = field(default=None)


def _norm_cur(c: str | None) -> str | None:
    if not c:
        return None
    c = c.lower()
    for k, v in _CUR_NORMAL.items():
        if c.startswith(k):
            return v
    return None


def _to_int(num: str, k: str | None) -> int:
    s = num.replace(" ", " ").replace(" ", " ")
    if re.fullmatch(r"\d{1,3}(?:[ .,]\d{3})+", s):
        val = float(re.sub(r"[ .,]", "", s))
    else:
        val = float(s.replace(",", "."))
    if k:
        val *= 1000
    return int(round(val))


def parse_salary(text: str) -> Salary | None:
    """Find the most plausible salary mention in free text."""
    if not text:
        return None
    lines = [ln for ln in text.splitlines() if ln.strip()]
    prioritized = [ln for ln in lines if _SALARY_KW.search(ln)] + [ln for ln in lines if not _SALARY_KW.search(ln)]
    for line in prioritized:
        if _PER_HOUR.search(line):
            continue
        has_kw = bool(_SALARY_KW.search(line))
        for m in _SALARY_RE.finditer(line):
            a1, a2 = m.group("a1"), m.group("a2")
            if not a1:
                continue
            cur = next((_norm_cur(m.group(g)) for g in ("c1", "c2", "c3", "c4") if m.group(g)), None)
            k1, k2 = m.group("k1"), m.group("k2")
            if not (cur or k1 or k2 or has_kw):
                continue
            if not (cur or has_kw) and (not (m.group("pre") or a2) or _NOT_MONEY.search(line)):
                continue  # bare "100K+ RPS" style numbers
            v1 = _to_int(a1, k1)
            v2 = _to_int(a2, k2) if a2 else None
            if v2 is not None and k2 and not k1 and v1 < 1000:
                v1 *= 1000
            if cur is None:
                cur = "RUB"
            lo, hi = _PLAUSIBLE[cur]
            if v2 is not None and v2 < v1:
                v2 = None
            if not (lo <= v1 <= hi) or (v2 is not None and not (lo <= v2 <= hi)):
                continue
            pre = (m.group("pre") or "").lower()
            gross = None
            if re.search(r"на руки|net|нетто", line, re.I):
                gross = False
            elif re.search(r"gross|до вычета|брутто|гросс", line, re.I):
                gross = True
            if v2 is not None:
                return Salary(v1, v2, cur, gross, m.group(0).strip())
            if pre in ("до", "up to"):
                return Salary(None, v1, cur, gross, m.group(0).strip())
            return Salary(v1, None, cur, gross, m.group(0).strip())
    return None


# --------------------------------------------------------------------------- format / grade / city
_REMOTE = re.compile(r"удал[её]н|удаленк|удалёнк|remote|дистанц|из любой точки", re.I)
_HYBRID = re.compile(r"гибрид|hybrid", re.I)
_OFFICE = re.compile(r"\bофис|office|on-?site|в офисе", re.I)


def detect_format(text: str) -> str | None:
    if _REMOTE.search(text):
        return "remote"
    if _HYBRID.search(text):
        return "hybrid"
    if _OFFICE.search(text):
        return "office"
    return None


_GRADES = [
    ("intern", re.compile(r"стаж[её]р|стажировк|intern|trainee", re.I)),
    ("junior", re.compile(r"junior|джун|младш", re.I)),
    ("middle", re.compile(r"middle|мидл", re.I)),
    ("senior", re.compile(r"senior|сеньор|синьор|старш", re.I)),
    ("lead", re.compile(r"\blead\b|тимлид|техлид|team ?lead|tech ?lead|ведущ|head of|руководител|архитектор|principal", re.I)),
]


_BODY_GRADES = [
    ("intern", re.compile(r"стаж[её]р|\bintern\b|trainee", re.I)),
    ("junior", re.compile(r"\bjunior\b", re.I)),
    ("middle", re.compile(r"\bmiddle\b", re.I)),
    ("senior", re.compile(r"\bsenior\b", re.I)),
    ("lead", re.compile(r"\bteam ?lead\b|\btech ?lead\b|тимлид|техлид", re.I)),
]


def detect_grade(title: str, text: str = "") -> str | None:
    """Earliest grade marker in the title; for the body only explicit tokens (less noise)."""
    for src, table in ((title, _GRADES), (text, _BODY_GRADES)):
        if not src:
            continue
        best: tuple[int, str] | None = None
        for grade, rx in table:
            m = rx.search(src)
            if m and (best is None or m.start() < best[0]):
                best = (m.start(), grade)
        if best:
            return best[1]
    return None


_CITIES = {
    "Москва": r"москв", "Санкт-Петербург": r"санкт-петербург|\bспб\b|питер", "Казань": r"казан",
    "Новосибирск": r"новосибирск", "Екатеринбург": r"екатеринбург", "Нижний Новгород": r"нижн\w* новгород",
    "Алматы": r"алмат", "Астана": r"астан", "Ташкент": r"ташкент", "Ереван": r"ереван", "Минск": r"минск",
    "Белград": r"белград", "Тбилиси": r"тбилиси", "Лимассол": r"лимассол", "Краснодар": r"краснодар",
    "Пермь": r"\bперм", "Самара": r"самар", "Ростов-на-Дону": r"ростов", "Иннополис": r"иннополис",
}
_CITY_RE = [(name, re.compile(rx, re.I)) for name, rx in _CITIES.items()]


def detect_city(text: str) -> str | None:
    best: tuple[int, str] | None = None
    for name, rx in _CITY_RE:
        m = rx.search(text)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), name)
    return best[1] if best else None


_TAG_STOP = {
    "вакансия", "вакансии", "работа", "job", "jobs", "hiring", "remote", "удаленка", "удалёнка", "удаленно",
    "офис", "гибрид", "hybrid", "office", "itвакансия", "itjobs", "it", "фултайм", "fulltime", "parttime",
    "junior", "middle", "senior", "lead", "intern", "стажировка", "стажер", "резюме", "вакансия_дня",
}


def skills_from_hashtags(tags: list[str]) -> list[str]:
    out = []
    for t in tags:
        low = t.lower()
        if low in _TAG_STOP or low.startswith(("работав", "работа_", "вакансия")) or len(low) < 2 or re.fullmatch(r"\d+[kк]?", low):
            continue
        out.append(t)
    return out


# --------------------------------------------------------------------------- page parsing
@dataclass(slots=True)
class TgPost:
    channel: str
    post_id: int
    text: str
    html: str
    published_at: datetime | None
    hashtags: list[str]


def parse_channel_page(page_html: str) -> list[TgPost]:
    """Parse a ``t.me/s/<channel>`` page into posts (pure)."""
    tree = LexborHTMLParser(page_html)
    posts: list[TgPost] = []
    for node in tree.css("div.tgme_widget_message[data-post]"):
        data_post = node.attributes.get("data-post") or ""
        if "/" not in data_post:
            continue
        channel, _, pid = data_post.rpartition("/")
        if not pid.isdigit():
            continue
        txt_node = node.css_first(".tgme_widget_message_bubble > .tgme_widget_message_text") or node.css_first(
            ".tgme_widget_message_text"
        )
        frag = txt_node.html if txt_node is not None else ""
        text = http.html_to_text(frag or "")
        t = node.css_first(".tgme_widget_message_date time[datetime]") or node.css_first("time[datetime]")
        published = None
        if t is not None:
            try:
                published = dtparser.isoparse(t.attributes.get("datetime") or "")
            except (ValueError, TypeError):
                published = None
        posts.append(TgPost(channel, int(pid), text, frag or "", published, extract_hashtags(text)))
    return posts


def post_to_vacancy(post: TgPost) -> RawVacancy | None:
    """Turn a channel post into a RawVacancy, or None if it's not a vacancy (pure)."""
    text = post.text
    if not is_vacancy(text):
        return None
    title_full = extract_title(text)
    if not _ROLE_KW.search(title_full) or title_full.endswith("?"):
        return None  # articles, podcasts, ads that merely mention jobs
    title, comp_from_title = split_title_company(title_full)
    # @handles are usually recruiters -> ignored
    company = extract_company(text) or comp_from_title or company_before_title(text, title_full)
    sal = parse_salary(text)
    ext = f"{post.channel}/{post.post_id}"
    return RawVacancy(
        source="telegram",
        external_id=ext,
        url=f"https://t.me/{ext}",
        title=title or title_full,
        company=company,
        description=text,
        published_at=post.published_at,
        salary_from=sal.salary_from if sal else None,
        salary_to=sal.salary_to if sal else None,
        currency=sal.currency if sal else None,
        salary_gross=sal.gross if sal else None,
        city=detect_city(text),
        work_format=detect_format(text),
        grade_hint=detect_grade(title_full, text),
        skills_hint=skills_from_hashtags(post.hashtags),
        payload={"channel": post.channel, "post_id": post.post_id, "html": post.html, "salary_raw": sal.raw if sal else None},
    )


# --------------------------------------------------------------------------- collector
@register("telegram")
class TelegramCollector(BaseCollector):
    title = "Telegram-каналы"
    min_interval = 1.5

    def channels(self) -> list[str]:
        chans = getattr(self.settings, "telegram_channels", None) or DEFAULT_CHANNELS
        return [c.strip().lstrip("@").removeprefix("https://t.me/").strip("/") for c in chans if c and c.strip()]

    async def collect(self, limit: int = 100) -> list[RawVacancy]:
        if getattr(self.settings, "tg_api_id", None) and getattr(self.settings, "tg_api_hash", None):
            try:
                return await self._collect_mtproto(limit)
            except NotImplementedError:
                pass  # fall back to the web preview
        return await self._collect_web(limit)

    async def _collect_mtproto(self, limit: int) -> list[RawVacancy]:
        # TODO(mtproto): Telethon client with a persisted session:
        #   async with TelegramClient(session, api_id, api_hash) as c:
        #       async for msg in c.iter_messages(channel, limit=...): build TgPost(msg.text, msg.date) -> post_to_vacancy
        # Needs an interactive first login to create the session file, so it's off by default.
        raise NotImplementedError

    async def _collect_web(self, limit: int) -> list[RawVacancy]:
        channels = self.channels()
        per_channel = max(1, math.ceil(limit / max(len(channels), 1)))
        max_pages = int(getattr(self.settings, "telegram_pages", 4) or 4)
        out: list[RawVacancy] = []
        errors: list[str] = []
        for ch in channels:
            try:
                out.extend(await self._collect_channel(ch, per_channel, max_pages))
            except CollectorError as e:
                log.warning("telegram: channel %s failed: %s", ch, e)
                errors.append(f"{ch}: {e}")
        if not out and errors:
            raise CollectorError("telegram: all channels failed: " + "; ".join(errors))
        return out[:limit]

    async def _collect_channel(self, channel: str, want: int, max_pages: int) -> list[RawVacancy]:
        found: list[RawVacancy] = []
        before: int | None = None
        for _ in range(max_pages):
            params: dict[str, Any] | None = {"before": before} if before else None
            page = await http.fetch(self.key, f"https://t.me/s/{channel}", params=params, min_interval=self.min_interval)
            posts = parse_channel_page(page)
            if not posts:
                if before is None:
                    raise CollectorError(f"channel {channel} has no public preview")
                break
            for p in sorted(posts, key=lambda p: p.post_id, reverse=True):
                v = post_to_vacancy(p)
                if v and all(f.external_id != v.external_id for f in found):
                    found.append(v)
            if len(found) >= want:
                break
            min_id = min(p.post_id for p in posts)
            if before is not None and min_id >= before:
                break
            before = min_id
        return found[:want]
