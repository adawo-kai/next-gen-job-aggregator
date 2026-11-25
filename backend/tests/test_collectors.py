"""Offline tests for collectors' parsing logic (saved real Habr / t.me samples in tests/fixtures)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.collectors import demo, habr, hh, http, telegram
from app.collectors.base import CollectorError, RawVacancy, registry

FIX = Path(__file__).parent / "fixtures"
APP_FIX = Path(__file__).resolve().parents[1] / "app" / "collectors" / "fixtures"


def _settings(**kw):
    base = dict(telegram_channels=[], tg_api_id=None, tg_api_hash=None, hh_access_token=None,
                hh_contact_email="dev@example.com", habr_detail_limit=0, demo_fixture_path=str(APP_FIX / "demo_vacancies.json"))
    base.update(kw)
    return SimpleNamespace(**base)


# ------------------------------------------------------------------ registry
def test_registry_has_all_sources():
    reg = registry()
    assert {"hh", "habr", "telegram", "demo"} <= set(reg)
    assert reg["habr"].title == "Habr Карьера"
    assert reg["telegram"].title == "Telegram-каналы"


# ------------------------------------------------------------------ salary regex
@pytest.mark.parametrize(
    "text,expected",
    [
        ("ЗП: 150 000–250 000 ₽", (150000, 250000, "RUB")),
        ("от 150 000 до 250 000 руб.", (150000, 250000, "RUB")),
        ("$3000-5000", (3000, 5000, "USD")),
        ("$3k-5k", (3000, 5000, "USD")),
        ("3 000 - 5 000 USD", (3000, 5000, "USD")),
        ("Зарплата: 200к", (200000, None, "RUB")),
        ("от 220к₽", (220000, None, "RUB")),
        ("з/п до 300 000 рублей", (None, 300000, "RUB")),
        ("200-300k", (200000, 300000, "RUB")),
        ("€4 000 – 5 500", (4000, 5500, "EUR")),
        ("Оклад 500 000 тенге", (500000, None, "KZT")),
        ("Вилка: 180 - 250 тыс. руб", (180000, 250000, "RUB")),
    ],
)
def test_parse_salary(text, expected):
    s = telegram.parse_salary(text)
    assert s is not None, text
    assert (s.salary_from, s.salary_to, s.currency) == expected


@pytest.mark.parametrize("text", ["опыт от 3 лет", "25$/час", "Python 3.12, команда 15 человек", "нагрузка 100K+ RPS", ""])
def test_parse_salary_negative(text):
    assert telegram.parse_salary(text) is None


def test_salary_net_gross():
    assert telegram.parse_salary("от 75 000 до 85 000 ₽ за месяц, на руки").gross is False
    assert telegram.parse_salary("300 000 ₽ gross").gross is True


# ------------------------------------------------------------------ telegram text heuristics
def test_extract_title_strips_emoji_hashtags_and_headers():
    text = "#вакансия #python #remote\n🔥 Вакансия: Senior Python Developer\nКомпания: Ozon\nЗП: 300к ₽"
    assert telegram.extract_title(text) == "Senior Python Developer"


def test_extract_title_seek_prefix_and_company_split():
    title = telegram.extract_title("💼 JOB OPPORTUNITY\n🚀 Ищем Backend-разработчика на Go\nУдалённо")
    assert title.startswith("Backend-разработчика на Go")
    t, comp = telegram.split_title_company("Продуктовый маркетолог в Контур")
    assert (t, comp) == ("Продуктовый маркетолог", "Контур")
    assert telegram.split_title_company("Разработчик в команду платежей") == ("Разработчик в команду платежей", None)


def test_extract_company_variants():
    assert telegram.extract_company("Python dev\nКомпания: Яндекс\nУдалённо") == "Яндекс"
    assert telegram.extract_company("Python dev\nCompany: Benchling") == "Benchling"
    assert telegram.extract_company("Ищем разработчика в компанию Selectel, удалённо") == "Selectel"


@pytest.mark.parametrize(
    "text,fmt",
    [("Формат: удалёнка", "remote"), ("Remote, worldwide", "remote"), ("Гибрид (Москва)", "hybrid"), ("Офис в Казани", "office"), ("Python", None)],
)
def test_detect_format(text, fmt):
    assert telegram.detect_format(text) == fmt


def test_detect_grade_and_city():
    assert telegram.detect_grade("Senior Python Developer") == "senior"
    assert telegram.detect_grade("Стажёр-аналитик") == "intern"
    assert telegram.detect_grade("Python-разработчик", "#junior #офис") == "junior"
    assert telegram.detect_grade("Python-разработчик", "руководитель отдела расскажет") is None
    assert telegram.detect_city("Гибрид, СПб или Москва") == "Санкт-Петербург"


def test_is_vacancy_filters_ads_and_digests():
    assert not telegram.is_vacancy("Реклама. ПАО МТС. ИНН: 7740000076. Erid: 2VfnxvYb8VK вакансия требования")
    assert not telegram.is_vacancy("Открытый урок «ИИ-инструменты аналитика» — приходи, расскажем про вакансии и зарплаты")
    digest = "\n".join(f"Python-разработчик в Компания{i}. Удалённо." for i in range(6))
    assert telegram.is_digest(digest)
    assert telegram.is_vacancy("Senior Python Developer\nТребования: опыт от 3 лет, FastAPI\nЗП: 300к ₽\nУдалённо")


def test_hashtags_to_skills():
    tags = telegram.extract_hashtags("#вакансия #Python #FastAPI #300k #удаленка #senior")
    assert telegram.skills_from_hashtags(tags) == ["Python", "FastAPI"]


# ------------------------------------------------------------------ telegram page fixture
def test_parse_tg_page_fixture():
    posts = telegram.parse_channel_page((FIX / "tg_job_python.html").read_text(encoding="utf-8"))
    assert len(posts) >= 15
    assert all(p.channel == "job_python" and p.post_id > 0 for p in posts)
    assert all(p.published_at is not None and p.published_at.tzinfo for p in posts)
    vacs = [v for v in (telegram.post_to_vacancy(p) for p in posts) if v]
    assert len(vacs) >= 10
    ads = [p for p in posts if "Erid" in p.text]
    assert ads and all(telegram.post_to_vacancy(p) is None for p in ads)
    v = vacs[0]
    assert isinstance(v, RawVacancy) and v.source == "telegram"
    assert v.external_id == f"job_python/{posts[[p.post_id for p in posts].index(int(v.external_id.split('/')[1]))].post_id}"
    assert v.url == f"https://t.me/{v.external_id}"
    assert all(v.title and len(v.title) <= 150 and "#" not in v.title for v in vacs)
    with_salary = [v for v in vacs if v.salary_from or v.salary_to]
    assert with_salary and all(v.currency == "RUB" for v in with_salary)
    assert any(v.company for v in vacs)


# ------------------------------------------------------------------ habr fixtures
def test_habr_list_mapping():
    data = json.loads((FIX / "habr_list.json").read_text(encoding="utf-8"))
    items = data["list"]
    vs = [habr.parse_list_item(i) for i in items]
    assert len(vs) == len(items) > 0
    for v, raw in zip(vs, items):
        assert v.source == "habr" and v.external_id == str(raw["id"])
        assert v.url.startswith("https://career.habr.com/vacancies/")
        assert v.title == raw["title"].strip()
        assert v.company == raw["company"]["title"]
        assert v.published_at is not None
        assert v.skills_hint == [s["title"] for s in raw["skills"]]
        if raw["salary"]["from"] or raw["salary"]["to"]:
            assert v.currency == "RUB"
        else:
            assert v.currency is None
        if raw["remoteWork"]:
            assert v.work_format == "remote"
    assert any(v.grade_hint for v in vs)


@pytest.mark.parametrize(
    "title,grade",
    [("Стажёр (Intern)", "intern"), ("Младший (Junior)", "junior"), ("Средний (Middle)", "middle"),
     ("Старший (Senior)", "senior"), ("Ведущий (Lead)", "lead")],
)
def test_habr_grade_map(title, grade):
    assert habr.map_grade({"salaryQualification": {"title": title}}) == grade


def test_habr_item_salary_and_remote():
    item = {"id": 1, "href": "/vacancies/1", "title": "Go dev", "remoteWork": True,
            "salary": {"from": 200000, "to": 300000, "currency": "rur"}, "company": {"title": "X", "logo": {"src": "l.png"}},
            "publishedDate": {"date": "2026-11-24T22:38:46+03:00"}, "skills": [{"title": "Go"}], "locations": []}
    v = habr.parse_list_item(item)
    assert (v.salary_from, v.salary_to, v.currency, v.work_format, v.company_logo) == (200000, 300000, "RUB", "remote", "l.png")
    assert "Go" in v.description


def test_habr_detail_description():
    desc = habr.extract_description((FIX / "habr_detail.html").read_text(encoding="utf-8"))
    assert desc and len(desc) > 300
    assert "<" not in desc
    assert "Требования" in desc or "Обязанности" in desc
    assert habr.extract_description("<html><body>nothing</body></html>") is None


# ------------------------------------------------------------------ hh mapping
HH_ITEM = {
    "id": "123", "name": "Python-разработчик", "alternate_url": "https://hh.ru/vacancy/123",
    "salary": {"from": 200000, "to": None, "currency": "RUR", "gross": True},
    "area": {"name": "Москва"}, "schedule": {"id": "remote"}, "experience": {"id": "between3And6"},
    "employer": {"name": "Ozon", "logo_urls": {"240": "https://img/240.png"}},
    "snippet": {"requirement": "Опыт с <highlighttext>Python</highlighttext>", "responsibility": "Писать сервисы"},
    "published_at": "2026-11-24T10:00:00+0300",
}


def test_hh_mapping():
    v = hh.parse_item(HH_ITEM)
    assert (v.source, v.external_id, v.currency, v.salary_from, v.salary_gross) == ("hh", "123", "RUB", 200000, True)
    assert (v.city, v.work_format, v.grade_hint, v.company, v.company_logo) == ("Москва", "remote", "senior", "Ozon", "https://img/240.png")
    assert "Писать сервисы" in v.description and "Python" in v.description
    assert v.published_at is not None


@pytest.mark.parametrize("sched,fmt", [("remote", "remote"), ("flexible", "hybrid"), ("fullDay", "office")])
def test_hh_schedule(sched, fmt):
    assert hh.parse_item({**HH_ITEM, "schedule": {"id": sched}}).work_format == fmt


def test_hh_disabled_without_token():
    c = hh.HHCollector(_settings())
    assert not c.enabled()
    with pytest.raises(CollectorError):
        asyncio.run(c.collect(5))
    assert hh.HHCollector(_settings(hh_access_token="t")).enabled()


# ------------------------------------------------------------------ demo
def test_demo_collector_and_labels():
    vs = asyncio.run(demo.DemoCollector(_settings()).collect(10_000))
    assert len(vs) >= 350
    assert {v.source for v in vs} == {"hh", "habr", "telegram"}
    assert all(v.published_at is not None for v in vs)
    ids = {f"{v.source}:{v.external_id}" for v in vs}
    assert len(ids) == len(vs)
    labels = json.loads((APP_FIX / "dedup_labels.json").read_text(encoding="utf-8"))
    groups = labels["duplicate_groups"]
    assert sum(len(g) - 1 for g in groups) >= 50
    assert all(set(g) <= ids for g in groups)
    by_id = {f"{v.source}:{v.external_id}": v for v in vs}
    assert all(len({by_id[i].source for i in g}) == len(g) for g in groups)  # cross-platform
    assert len(labels["eternal_groups"]) >= 15
    for g in labels["eternal_groups"]:
        ages = [by_id[i].payload["days_ago"] for i in g["ids"]]
        assert max(ages) >= 90 and len(g["ids"]) >= 6


def test_demo_missing_fixture():
    with pytest.raises(CollectorError):
        demo.load_records(Path("does/not/exist.json"))


# ------------------------------------------------------------------ http helper
def test_retry_after_and_html_to_text():
    assert http.parse_retry_after("5") == 5.0
    assert http.parse_retry_after(None) is None
    assert http.parse_retry_after("garbage") is None
    assert http.html_to_text("<p>a&nbsp;b</p><ul><li>x</li><li>y</li></ul>line<br>next") == "a b\n\n• x\n• y\nline\nnext"
    assert len(set(http.USER_AGENTS)) >= 8


def test_fetch_retries_429_then_ok_and_403_raises(monkeypatch):
    import httpx

    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/blocked":
            return httpx.Response(403)
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "0"})
        assert request.headers["User-Agent"] in http.USER_AGENTS
        return httpx.Response(200, json={"ok": True})

    async def run():
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        monkeypatch.setattr(http, "_get_client", lambda: client)
        assert await http.fetch("t", "https://x.test/ok", min_interval=0, as_json=True) == {"ok": True}
        with pytest.raises(CollectorError):
            await http.fetch("t", "https://x.test/blocked", min_interval=0)
        await client.aclose()

    asyncio.run(run())
    assert calls["n"] == 2
