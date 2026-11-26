"""Data-quality guards: IT relevance gate and Telegram title/company sanity checks.

Cases are real titles/companies observed in live Telegram and Habr collection.
"""

from datetime import UTC, datetime

import pytest

from app.collectors.base import RawVacancy
from app.collectors.telegram import clean_title, plausible_company, plausible_title
from app.pipeline.normalize import normalize
from app.pipeline.quality import is_it


def _n(title: str, desc: str = "", skills=None):
    return normalize(RawVacancy(source="habr", external_id="x", url="u", title=title, company="X",
                                description=desc, published_at=datetime.now(UTC), skills_hint=skills or []))


@pytest.mark.parametrize("title", [
    "Senior Python Developer", "Программист 1С", "Инженер по тестированию / QA Engineer", "Data Engineer",
    "Product Manager (Hotels)", "Системный администратор", "Team Lead IT Infrastructure & Support",
    "Автотестировщик/AQA (Python)", "Старший менеджер продукта",
])
def test_it_titles_pass(title):
    assert is_it(_n(title))


@pytest.mark.parametrize("title,skills", [
    ("Лидогенератор (организатор бизнес-встреч) по Казахстану", ["Ведение переговоров", "Machine Learning"]),
    ("Head of Sales", []),
    ("Business Development Manager", ["Переговоры"]),
])
def test_non_it_titles_rejected(title, skills):
    assert not is_it(_n(title, skills=skills))


def test_non_it_title_with_real_stack_passes():
    assert is_it(_n("Специалист по автоматизации", "Python, PostgreSQL, Docker"))


@pytest.mark.parametrize("title", [
    "Senior", "Должен знать каждый дизайнер", "Что важно для DS/ML-специалистов",
    "самостоятельно вести DS-решения от идеи до production", "Ozon Tech запустил ML&DS Fаst Track",
])
def test_bad_telegram_titles(title):
    assert not plausible_title(title)


@pytest.mark.parametrize("title", ["Python developer", "Junior+ QA Engineer (manual)", "Senior Data Scientist"])
def test_good_telegram_titles(title):
    assert plausible_title(title)


def test_clean_title():
    assert clean_title("SEO- специалиста(строго") == "SEO- специалиста"
    assert clean_title("Senior system analyst в стабильную финтех компанию Узбекистана") == "Senior system analyst"


@pytest.mark.parametrize("bad", ["Маркетинг", "Поддержка", "Что предстоит", "NDA", "Топ навыки для роста в дизайне",
                                 "Разрабатывает систематические торговые стратегии на стыке финансовых рынков"])
def test_generic_companies_dropped(bad):
    assert plausible_company(bad) is None


@pytest.mark.parametrize("good", ["Альфа-Банк", "Swordfish Security", "Rambler&Co", "WB—Tech", "Группа Rubytech"])
def test_real_companies_kept(good):
    assert plausible_company(good) == good
