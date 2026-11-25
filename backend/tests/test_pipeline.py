from datetime import UTC, datetime

from app.api.tracker import can_move
from app.collectors.base import RawVacancy
from app.pipeline import skills as sk
from app.pipeline.dedup import score_pair, text_similarity
from app.pipeline.enrich import rules_enrich, water_score
from app.pipeline.match import ProfileView, VacancyView, compute
from app.pipeline.normalize import detect_format, detect_grade, norm_company, norm_title, normalize


def raw(**kw):
    base = dict(source="hh", external_id="1", url="u", title="Senior Python Developer", company="ООО «Ромашка»",
                description="Задачи:\n• Разработка микросервисов на FastAPI\nТребования:\n• Python 5+ лет, PostgreSQL, Kafka\n"
                            "Будет плюсом:\n• Kubernetes\nУсловия:\n• Удалёнка, ДМС",
                published_at=datetime.now(UTC), salary_from=300000, salary_to=400000, currency="rur")
    base.update(kw)
    return RawVacancy(**base)


def test_skill_synonyms():
    assert sk.canonical("k8s") == "Kubernetes"
    assert sk.canonical("Постгрес") == "PostgreSQL"
    assert sk.canonical("питон") == "Python"
    assert "Go" in sk.extract("Ищем backend разработчика на Go (golang)")
    assert "Go" not in sk.extract("Let's go to the office")


def test_title_and_company_normalisation_is_order_and_noise_insensitive():
    assert norm_title("Senior Python Developer") == norm_title("Python разработчик (Senior)")
    assert norm_company('ООО «Ромашка»') == norm_company("Ромашка")


def test_grade_detection_from_text_when_not_in_title():
    assert detect_grade("Python разработчик", "Опыт от 5 лет в коммерческой разработке", None) == "senior"
    assert detect_grade("Стажёр-аналитик", "", None) == "intern"
    assert detect_format("Работа полностью удалённо", None) == "remote"


def test_normalize_currency_and_skills():
    n = normalize(raw())
    assert n.currency == "RUB"
    assert {"Python", "PostgreSQL", "Kafka", "FastAPI"} <= set(n.skills)
    assert n.grade == "senior"


def test_rules_enrichment_summary_and_nice_to_have():
    n = normalize(raw())
    e = rules_enrich(n.title, n.description_text, n.skills, True)
    assert e.summary.what_to_do and e.summary.requirements and e.summary.conditions
    assert "Kubernetes" in e.nice_to_have and "Kubernetes" not in e.must_have
    assert e.method == "rules"


def test_red_flags_and_water():
    text = ("Мы — дружный коллектив и одна семья! Динамично развивающаяся компания. Стрессоустойчивость, "
            "готовность к переработкам. Тестовое задание на 3 дня, не оплачивается. И другие задачи.")
    e = rules_enrich("Менеджер", text, [], False)
    codes = {f.code for f in e.red_flags}
    assert {"overtime", "stress", "family", "unpaid_test", "vague"} <= codes
    assert e.water_score >= 60
    assert water_score("Python, PostgreSQL, Kafka, Docker. Зарплата 300к. " * 5, True, 6) < 20


def test_dedup_scores_reworded_duplicate_high_and_other_job_low():
    a = normalize(raw())
    b = normalize(raw(source="telegram", external_id="tg/1", title="Python разработчик (Senior) в Ромашку",
                      description=raw().description.replace("Задачи", "Чем заниматься")))

    class V:  # minimal stand-in for ORM row
        pass

    v = V()
    v.description_text, v.tags, v.city, v.grade = a.description_text, a.skills, None, "senior"
    v.salary_from, v.salary_to, v.currency = 300000, 400000, "RUB"
    score, _ = score_pair(b, v, title_sim=0.8)
    assert score >= 0.62
    c = normalize(raw(title="Frontend React Developer", description="React, TypeScript, Redux", salary_from=150000, salary_to=180000))
    score2, _ = score_pair(c, v, title_sim=0.2)
    assert score2 < 0.62
    assert text_similarity("abc def", "abc def") == 1.0


def test_match_score_explainable_and_stop_words():
    p = ProfileView(skills=["Python", "PostgreSQL"], grade="senior", desired_salary_rub=300000,
                    work_formats=["remote"], stop_words=["1С"])
    v = VacancyView(title="Senior Python", text="...", tags=["Python", "PostgreSQL", "Kafka"],
                    must_have=["Python", "PostgreSQL", "Kafka"], nice_to_have=["Kubernetes"], grade="senior",
                    salary_rub_from=300000, salary_rub_to=400000, work_format="remote")
    r = compute(p, v)
    assert 70 <= r.score <= 95
    assert r.missing_must == ["Kafka"] and r.missing_nice == ["Kubernetes"]
    assert {b["factor"] for b in r.breakdown} == {"skills", "grade", "salary", "format", "stop_words"}
    v.title = "Программист 1С"
    assert compute(p, v).score < 30


def test_tracker_state_machine():
    assert can_move("saved", "applied")
    assert can_move("applied", "interview")
    assert not can_move("saved", "offer")
    assert not can_move("offer", "saved")
