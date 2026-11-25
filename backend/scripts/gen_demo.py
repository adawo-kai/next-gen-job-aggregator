"""Generate the deterministic demo dataset (seed=42).

    python scripts/gen_demo.py            # from backend/

Writes:
  app/collectors/fixtures/demo_vacancies.json  (~400 vacancies across hh / habr / telegram)
  app/collectors/fixtures/dedup_labels.json    (ground truth for dedup precision/recall + eternal groups)

Built-in test cases:
  * cross-platform duplicates (same job on hh+telegram, habr+hh, some on all three) with reworded
    titles, reformatted descriptions and slightly different salary notation
  * "eternal" vacancies: same company+title reposted every 7-14 days for 90-120 days
  * red flags: unpaid test task, overtime, "дружный коллектив" water, vague duties, stress tolerance
  * junior / intern / 1С vacancies for stop-word tests
"""

from __future__ import annotations

import json
import random
from pathlib import Path

SEED = 42
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "app" / "collectors" / "fixtures"

N_BASE = 225
N_DUP = 60  # extra postings that duplicate a base vacancy on another platform
N_ETERNAL = 15
N_REDFLAG = 30

COMPANIES = [
    ("Яндекс", "Москва"), ("Т-Банк", "Москва"), ("Тинькофф", "Москва"), ("Ozon", "Москва"), ("Авито", "Москва"),
    ("Kaspersky", "Москва"), ("VK", "Санкт-Петербург"), ("Сбер", "Москва"), ("Wildberries", "Москва"),
    ("Selectel", "Санкт-Петербург"), ("Positive Technologies", "Москва"), ("2ГИС", "Новосибирск"),
    ("СКБ Контур", "Екатеринбург"), ("Альфа-Банк", "Москва"), ("МТС", "Москва"), ("Lamoda", "Москва"),
    ("Самокат", "Москва"), ("X5 Tech", "Москва"), ("JetBrains", "Белград"), ("Kolesa Group", "Алматы"),
    ("Kaspi.kz", "Алматы"), ("Picsart", "Ереван"), ("ICS-IT", "Казань"), ("Ак Барс Цифровые Технологии", "Казань"),
    ("Точка", "Москва"), ("Купер", "Москва"), ("Dodo Engineering", "Москва"), ("Флант", "Москва"),
    ("Datapulse", None), ("Cloudberry Labs", None), ("Северсталь Диджитал", "Санкт-Петербург"), ("Инфосистемы Джет", "Москва"),
    ("ФинТехЛаб", None), ("Рога и Копыта Софт", "Москва"),
]
SHADY = ["Рога и Копыта Софт", "ФинТехЛаб", "Cloudberry Labs"]

GRADES = ["intern", "junior", "middle", "senior", "lead"]
GRADE_EN = {"intern": "Intern", "junior": "Junior", "middle": "Middle", "senior": "Senior", "lead": "Lead"}
GRADE_RU = {"intern": "Стажёр", "junior": "Младший", "middle": "", "senior": "Старший", "lead": "Ведущий"}
HABR_Q = {"intern": "Стажёр (Intern)", "junior": "Младший (Junior)", "middle": "Средний (Middle)", "senior": "Старший (Senior)", "lead": "Ведущий (Lead)"}
HH_EXP = {"intern": "noExperience", "junior": "noExperience", "middle": "between1And3", "senior": "between3And6", "lead": "moreThan6"}
HH_GRADE = {"noExperience": "junior", "between1And3": "middle", "between3And6": "senior", "moreThan6": "lead"}
BASE_SALARY = {"intern": (40_000, 80_000), "junior": (80_000, 150_000), "middle": (170_000, 280_000), "senior": (300_000, 450_000), "lead": (420_000, 650_000)}

# role key -> (en title, ru title, skills pool, tasks, reqs, salary multiplier)
ROLES = {
    "python": ("Python Developer", "Python-разработчик", ["Python", "Django", "FastAPI", "PostgreSQL", "Redis", "Celery", "Docker", "asyncio", "Kafka"],
               ["разрабатывать и поддерживать backend-сервисы на Python", "проектировать REST и gRPC API", "оптимизировать запросы к PostgreSQL", "покрывать код тестами (pytest)", "участвовать в code review"],
               ["опыт коммерческой разработки на Python", "уверенное знание SQL и PostgreSQL", "понимание асинхронности (asyncio)", "опыт с Docker и CI/CD"], 1.0),
    "go": ("Go Developer", "Golang-разработчик", ["Go", "PostgreSQL", "Kafka", "gRPC", "Kubernetes", "Redis", "ClickHouse", "Prometheus"],
           ["разрабатывать высоконагруженные микросервисы на Go", "проектировать взаимодействие сервисов через Kafka и gRPC", "настраивать мониторинг и алерты", "разбирать инциденты в проде"],
           ["опыт разработки на Go", "понимание конкурентности: goroutines, channels", "опыт с брокерами сообщений", "знание Kubernetes будет плюсом"], 1.1),
    "java": ("Java Developer", "Java-разработчик", ["Java", "Spring Boot", "Kafka", "PostgreSQL", "Hibernate", "Microservices", "Kotlin"],
             ["развивать микросервисы на Java/Spring Boot", "интегрироваться с внешними системами", "улучшать производительность и надёжность", "менторить младших коллег"],
             ["опыт разработки на Java 17+", "Spring Boot, Spring Data", "опыт с Kafka или RabbitMQ", "понимание принципов SOLID"], 1.05),
    "frontend": ("Frontend Developer (React)", "Frontend-разработчик (React)", ["JavaScript", "TypeScript", "React", "Redux", "Next.js", "Webpack", "CSS"],
                 ["разрабатывать интерфейсы на React и TypeScript", "переиспользовать компоненты дизайн-системы", "оптимизировать производительность фронтенда", "писать unit-тесты (Jest)"],
                 ["уверенное знание TypeScript", "опыт с React от года", "понимание работы браузера", "умение работать с REST API"], 0.95),
    "vue": ("Frontend Developer (Vue)", "Frontend-разработчик (Vue.js)", ["JavaScript", "TypeScript", "Vue", "Nuxt", "Pinia", "Vite"],
            ["развивать SPA на Vue 3", "верстать адаптивные интерфейсы", "интегрировать фронтенд с API"],
            ["опыт с Vue 2/3", "знание TypeScript", "опыт работы с Git"], 0.9),
    "devops": ("DevOps Engineer", "DevOps-инженер", ["Kubernetes", "Docker", "Terraform", "Ansible", "GitLab CI", "Prometheus", "Grafana", "Linux", "Helm"],
               ["поддерживать и развивать инфраструктуру в Kubernetes", "автоматизировать CI/CD пайплайны", "внедрять IaC (Terraform, Ansible)", "настраивать мониторинг (Prometheus, Grafana)"],
               ["уверенный Linux", "опыт с Kubernetes в проде", "опыт с Terraform или Ansible", "понимание сетей"], 1.05),
    "data": ("Data Engineer", "Инженер данных", ["Python", "SQL", "Airflow", "Spark", "ClickHouse", "Kafka", "Hadoop", "dbt"],
             ["строить ETL/ELT пайплайны на Airflow", "развивать DWH на ClickHouse", "обеспечивать качество данных", "работать со Spark"],
             ["отличное знание SQL", "опыт с Airflow", "Python для обработки данных", "опыт со Spark будет плюсом"], 1.0),
    "ml": ("ML Engineer", "ML-инженер", ["Python", "PyTorch", "ML", "LLM", "NLP", "Docker", "MLflow", "Pandas"],
           ["обучать и внедрять модели машинного обучения", "строить пайплайны инференса", "проводить A/B-эксперименты", "работать с LLM и RAG"],
           ["опыт в ML от 2 лет", "PyTorch или TensorFlow", "понимание классических алгоритмов ML", "опыт вывода моделей в прод"], 1.2),
    "analyst": ("Data Analyst", "Аналитик данных", ["SQL", "Python", "Pandas", "Tableau", "Power BI", "A/B-тесты", "ClickHouse"],
                ["строить дашборды и отчёты", "анализировать продуктовые метрики", "проводить A/B-тесты", "формулировать гипотезы"],
                ["уверенный SQL", "Python (pandas)", "знание статистики", "опыт с BI-инструментами"], 0.85),
    "qa": ("QA Engineer", "Инженер по тестированию", ["QA", "Python", "pytest", "Selenium", "Playwright", "Postman", "SQL", "Allure"],
           ["тестировать веб и мобильные приложения", "писать автотесты на Python", "вести тестовую документацию", "заводить и сопровождать баги"],
           ["опыт ручного и автоматизированного тестирования", "знание техник тест-дизайна", "умение работать с API (Postman)", "базовый SQL"], 0.8),
    "1c": ("1C Developer", "Программист 1С", ["1С", "1С:Предприятие", "БСП", "СКД", "SQL"],
           ["дорабатывать конфигурации 1С:ERP и УТ", "разрабатывать отчёты на СКД", "интегрировать 1С с внешними системами", "консультировать пользователей"],
           ["опыт разработки на платформе 1С 8.3", "знание типовых конфигураций", "наличие сертификата 1С:Специалист будет плюсом"], 0.85),
    "android": ("Android Developer", "Android-разработчик", ["Kotlin", "Android", "Jetpack Compose", "Coroutines", "MVVM", "Dagger"],
                ["разрабатывать мобильное приложение на Kotlin", "переводить экраны на Jetpack Compose", "улучшать стабильность и crash-free"],
                ["опыт разработки под Android", "Kotlin, Coroutines", "понимание архитектурных паттернов"], 1.0),
    "ios": ("iOS Developer", "iOS-разработчик", ["Swift", "iOS", "SwiftUI", "UIKit", "Combine"],
            ["развивать iOS-приложение на Swift", "внедрять SwiftUI", "работать над производительностью"],
            ["опыт разработки под iOS", "Swift, UIKit/SwiftUI", "понимание многопоточности"], 1.0),
    "fullstack": ("Fullstack Developer (Node.js/React)", "Fullstack-разработчик (Node.js + React)", ["Node.js", "TypeScript", "React", "NestJS", "PostgreSQL", "Docker"],
                  ["разрабатывать фичи от базы до интерфейса", "писать API на NestJS", "делать интерфейсы на React"],
                  ["опыт с Node.js и React", "TypeScript", "SQL"], 1.0),
    "pm": ("Product Manager", "Менеджер продукта", ["Product Management", "CustDev", "A/B-тесты", "SQL", "Jira", "Unit-экономика"],
           ["развивать продукт и формировать роадмап", "проводить CustDev-интервью", "ставить задачи команде разработки", "считать юнит-экономику"],
           ["опыт в продуктовом менеджменте от 2 лет", "умение работать с метриками", "базовый SQL"], 1.05),
    "java_kotlin_backend": ("Kotlin Backend Developer", "Backend-разработчик (Kotlin)", ["Kotlin", "Spring", "PostgreSQL", "Kafka", "Kubernetes"],
                            ["разрабатывать backend на Kotlin", "проектировать схемы данных", "работать с событийной архитектурой"],
                            ["опыт с Kotlin или Java", "Spring", "опыт работы с Kafka"], 1.05),
}
ROLE_WEIGHTS = {"python": 14, "go": 9, "java": 8, "frontend": 11, "vue": 4, "devops": 8, "data": 6, "ml": 6, "analyst": 7,
                "qa": 8, "1c": 6, "android": 4, "ios": 3, "fullstack": 5, "pm": 4, "java_kotlin_backend": 3}

COMPANY_ABOUT = [
    "{c} — одна из крупнейших технологических компаний, наши сервисы ежедневно используют миллионы людей.",
    "{c} — продуктовая IT-компания, мы делаем сервисы для бизнеса и частных клиентов.",
    "В {c} более 3000 инженеров, мы строим собственную платформу и инфраструктуру.",
    "{c} — быстрорастущий продукт, команда из 40 человек, работаем без бюрократии.",
    "{c} — аккредитованная IT-компания с собственными продуктами в финтехе.",
]
CONDITIONS = [
    "официальное оформление по ТК РФ с первого дня", "ДМС со стоматологией", "гибкое начало рабочего дня",
    "компенсация обучения и конференций", "современная техника на выбор", "оплачиваемые больничные сверх ТК",
    "релокационный пакет", "ежегодный пересмотр зарплаты", "корпоративный психолог", "4 дня дополнительного отпуска",
]
PLUS = ["опыт с высоконагруженными системами", "open-source проекты", "знание английского на уровне B2", "опыт менторства", "опыт работы в продуктовой команде"]

RED_FLAG_LINES = [
    "Обязательное тестовое задание (8-10 часов), не оплачивается.",
    "Готовность к переработкам и работе в выходные в период релизов.",
    "Стрессоустойчивость и умение работать в режиме многозадачности.",
    "У нас дружный коллектив и печеньки на кухне!",
    "Мы как семья — всегда поддерживаем друг друга.",
    "Выполнять различные задачи по поручению руководителя.",
    "Ненормированный рабочий день.",
    "Зарплата обсуждается по итогам собеседования, испытательный срок 3 месяца без оформления.",
    "Высокий уровень дохода, неограниченные возможности роста!",
    "Работа в молодом динамично развивающемся коллективе.",
]
VAGUE_TASKS = ["выполнять задачи по разработке", "участвовать в жизни проекта", "решать интересные задачи", "делать то, что потребуется команде"]

CITIES_RU = ["Москва", "Москва", "Москва", "Санкт-Петербург", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург"]
ABROAD = {"Алматы": ("Казахстан", "KZT"), "Ереван": ("Армения", "USD"), "Белград": ("Сербия", "EUR")}

TG_CHANNELS = ["job_python", "it_vakansii_jobs", "getitrussia", "forproducts", "jobforjunior", "datasciencejobs"]
TG_EMOJI = ["🔥", "🚀", "💼", "👨‍💻", "⚡️", "📌", "✅", "💰", "🏢", "📍"]

rnd = random.Random(SEED)


def round_to(x: float, step: int) -> int:
    return int(round(x / step) * step)


def fmt_rub(n: int) -> str:
    return f"{n:,}".replace(",", " ")


class Ids:
    def __init__(self) -> None:
        self.hh = 110_250_000
        self.habr = 1_000_150_000
        self.tg = {c: 4000 + i * 900 for i, c in enumerate(TG_CHANNELS)}

    def next(self, source: str) -> tuple[str, str]:
        if source == "hh":
            self.hh += rnd.randint(30, 900)
            return str(self.hh), f"https://hh.ru/vacancy/{self.hh}"
        if source == "habr":
            self.habr += rnd.randint(5, 300)
            return str(self.habr), f"https://career.habr.com/vacancies/{self.habr}"
        ch = rnd.choice(TG_CHANNELS)
        self.tg[ch] += rnd.randint(1, 6)
        ext = f"{ch}/{self.tg[ch]}"
        return ext, f"https://t.me/{ext}"


IDS = Ids()


def make_spec(role: str | None = None, grade: str | None = None, company: str | None = None, red_flag: bool = False) -> dict:
    """A 'real' vacancy independent of the platform it's posted on."""
    role = role or rnd.choices(list(ROLE_WEIGHTS), weights=list(ROLE_WEIGHTS.values()))[0]
    grade = grade or rnd.choices(GRADES, weights=[6, 18, 34, 30, 12])[0]
    if company is None:
        company, home = rnd.choice(COMPANIES)
    else:
        home = dict(COMPANIES).get(company)
    en, ru, skills_pool, tasks, reqs, mult = ROLES[role]
    fmt = rnd.choices(["remote", "hybrid", "office"], weights=[40, 35, 25])[0]
    if home in ABROAD:
        city = home
    elif home is None:
        city, fmt = None, "remote"
    else:
        city = home if rnd.random() < 0.7 else rnd.choice(CITIES_RU)
    country, currency = ABROAD.get(city or "", ("Россия", "RUB"))
    if city is None and rnd.random() < 0.35:
        currency, country = "USD", None
    lo, hi = BASE_SALARY[grade]
    lo, hi = lo * mult, hi * mult
    sal_from = round_to(rnd.uniform(lo, (lo + hi) / 2), 10_000)
    sal_to = round_to(sal_from * rnd.uniform(1.2, 1.5), 10_000)
    if currency == "USD":
        sal_from, sal_to = round_to(sal_from / 92, 100), round_to(sal_to / 92, 100)
    elif currency == "EUR":
        sal_from, sal_to = round_to(sal_from / 100, 100), round_to(sal_to / 100, 100)
    elif currency == "KZT":
        sal_from, sal_to = round_to(sal_from * 5.3, 10_000), round_to(sal_to * 5.3, 10_000)
    shape = rnd.random()
    if shape < 0.25 or (red_flag and rnd.random() < 0.6):
        sal_from = sal_to = None
    elif shape < 0.40:
        sal_to = None
    elif shape < 0.48:
        sal_from = None
    skills = rnd.sample(skills_pool, k=min(len(skills_pool), rnd.randint(3, 6)))
    if role in ("python", "go", "java") and grade in ("senior", "lead") and "Kubernetes" not in skills and rnd.random() < 0.4:
        skills.append("Kubernetes")
    task_list = rnd.sample(tasks, k=min(len(tasks), rnd.randint(3, 4)))
    req_list = rnd.sample(reqs, k=min(len(reqs), rnd.randint(2, 4)))
    years = {"intern": 0, "junior": 1, "middle": 2, "senior": 4, "lead": 6}[grade]
    if years:
        req_list.insert(0, f"опыт работы от {years} {'года' if years == 1 else 'лет'}")
    else:
        req_list.insert(0, "студенты старших курсов и выпускники профильных вузов")
    flags: list[str] = []
    if red_flag:
        flags = rnd.sample(RED_FLAG_LINES, k=rnd.randint(2, 4))
        if rnd.random() < 0.5:
            task_list = rnd.sample(VAGUE_TASKS, k=2)
    return {
        "role": role, "grade": grade, "company": company, "city": city, "country": country, "format": fmt,
        "currency": currency if (sal_from or sal_to) else None, "salary_from": sal_from, "salary_to": sal_to,
        "gross": rnd.choice([True, False, None]) if (sal_from or sal_to) else None,
        "skills": skills, "tasks": task_list, "reqs": req_list, "plus": rnd.sample(PLUS, 2),
        "conditions": rnd.sample(CONDITIONS, k=rnd.randint(3, 5)), "about": rnd.choice(COMPANY_ABOUT).format(c=company),
        "flags": flags, "en": en, "ru": ru,
    }


# ----------------------------------------------------------------- title wording variants
def title_variant(spec: dict, style: int) -> str:
    g, en, ru = spec["grade"], spec["en"], spec["ru"]
    ge, gr = GRADE_EN[g], GRADE_RU[g]
    base_en = en.replace(" Developer", "").replace(" Engineer", "")
    options = [
        f"{ge} {en}" if g != "middle" else en,                               # Senior Python Developer
        f"{ru} ({ge})",                                                       # Python-разработчик (Senior)
        f"{gr} {ru[0].lower() + ru[1:]}".strip().capitalize() if gr else ru,  # Старший python-разработчик
        f"{ge} {base_en} разработчик" if "Developer" in en else f"{ge} {ru}",  # Senior Python разработчик
        f"{ru} / {en}",                                                       # Python-разработчик / Python Developer
        f"{ge}+ {en}" if g in ("middle", "senior") else f"{ge} {en}",          # Middle+ Python Developer
    ]
    t = options[style % len(options)]
    return t[0].upper() + t[1:]


def salary_text(spec: dict, style: str) -> str | None:
    f, t, cur = spec["salary_from"], spec["salary_to"], spec["currency"]
    if not (f or t):
        return None
    sym = {"RUB": "₽", "USD": "$", "EUR": "€", "KZT": "₸"}[cur]
    if style == "tg" and cur == "RUB":
        k = lambda n: f"{n // 1000}к"  # noqa: E731
        if f and t:
            return f"{k(f)}–{k(t)} ₽"
        return f"от {k(f)} ₽" if f else f"до {k(t)} ₽"
    if style == "tg" and cur == "USD":
        if f and t:
            return f"${f}-{t}"
        return f"от ${f}" if f else f"до ${t}"
    if f and t:
        return f"{fmt_rub(f)} – {fmt_rub(t)} {sym}"
    return f"от {fmt_rub(f)} {sym}" if f else f"до {fmt_rub(t)} {sym}"


FORMAT_RU = {"remote": "удалённо", "hybrid": "гибрид", "office": "офис"}


def description(spec: dict, source: str, variant: int = 0) -> str:
    bullets = lambda xs: "\n".join(f"• {x}" for x in xs)  # noqa: E731
    flags = spec["flags"]
    if source == "telegram":
        e = rnd.sample(TG_EMOJI, 4)
        tags = " ".join("#" + s.replace(" ", "").replace(".", "").replace("/", "") for s in spec["skills"][:4])
        head = f"#вакансия #{GRADE_EN[spec['grade']].lower()} #{FORMAT_RU[spec['format']].replace('ё', 'е')} {tags}"
        sal = salary_text(spec, "tg")
        lines = [head, "", f"{e[0]} {title_variant(spec, variant)}", "", f"{e[1]} Компания: {spec['company']}",
                 f"📍 Формат: {FORMAT_RU[spec['format']]}" + (f" ({spec['city']})" if spec["city"] else ""),
                 f"{e[2]} ЗП: {sal}" + (" на руки" if spec["gross"] is False else "") if sal else f"{e[2]} ЗП: по договорённости",
                 "", "Чем предстоит заниматься:", bullets(spec["tasks"]), "", "Что ждём:", bullets(spec["reqs"])]
        if flags:
            lines += ["", *flags]
        lines += ["", "Что предлагаем:", bullets(spec["conditions"][:3]), "", f"Резюме: @hr_{rnd.randint(10, 99)}_{spec['company'][:4].lower()}"]
        return "\n".join(lines)
    sections = [("О компании", spec["about"]), ("Задачи", bullets(spec["tasks"])),
                ("Требования", bullets(spec["reqs"] + ([] if variant % 2 else flags[:1]))),
                ("Будет плюсом", bullets(spec["plus"])), ("Условия", bullets(spec["conditions"] + flags[1:]))]
    if variant % 2:  # reformatted copy: different section names & order
        sections = [("Чем предстоит заниматься", sections[1][1]), ("Мы ожидаем", sections[2][1]),
                    ("Мы предлагаем", sections[4][1]), ("Пара слов о нас", sections[0][1])]
        if flags:
            sections.insert(2, ("Важно", flags[0]))
    if source == "habr":
        return "\n\n".join(f"<p><strong>{h}:</strong></p>\n{body}" for h, body in sections)
    return "\n\n".join(f"{h}:\n{body}" for h, body in sections)


def posting(spec: dict, source: str, days_ago: float, variant: int = 0, kind: str = "base") -> dict:
    ext, url = IDS.next(source)
    grade = spec["grade"]
    if source == "hh":
        grade_hint = HH_GRADE[HH_EXP[grade]]
        skills = spec["skills"]
    elif source == "habr":
        grade_hint = grade
        skills = spec["skills"]
    else:
        grade_hint, skills = None, [s.replace(" ", "") for s in spec["skills"][:4]]
    sal_from, sal_to, cur = spec["salary_from"], spec["salary_to"], spec["currency"]
    gross = spec["gross"]
    if kind == "duplicate" and sal_from and rnd.random() < 0.3:  # same job, recruiter quoted net vs gross
        sal_from = round_to(sal_from * 0.87, 5_000 if cur in ("RUB", "KZT") else 100)
        sal_to = round_to(sal_to * 0.87, 5_000 if cur in ("RUB", "KZT") else 100) if sal_to else None
        gross = False
    if source == "telegram" and rnd.random() < 0.3:
        sal_from = sal_to = cur = None  # telegram posts often omit/garble salary
        gross = None
    return {
        "source": source,
        "external_id": ext,
        "url": url,
        "title": title_variant(spec, variant),
        "company": spec["company"],
        "description": description(spec, source, variant),
        "days_ago": round(days_ago, 2),
        "salary_from": sal_from,
        "salary_to": sal_to,
        "currency": cur,
        "salary_gross": gross if source == "hh" else None,
        "city": spec["city"],
        "country": spec["country"],
        "work_format": spec["format"],
        "grade_hint": grade_hint,
        "skills_hint": skills,
        "company_logo": None,
        "payload": {"demo": True, "kind": kind, "role": spec["role"], "true_grade": grade, "red_flags": bool(spec["flags"])},
    }


def main() -> None:
    vacancies: list[dict] = []
    dup_groups: list[list[str]] = []
    eternal_groups: list[dict] = []
    key = lambda v: f"{v['source']}:{v['external_id']}"  # noqa: E731

    # stop-word test cases: guaranteed junior / intern / 1C share
    forced = [("1c", None)] * 12 + [("python", "intern"), ("frontend", "intern"), ("qa", "intern"), ("analyst", "intern")] * 2 \
        + [(None, "junior")] * 14
    bases: list[tuple[dict, dict]] = []
    for i in range(N_BASE):
        role, grade = forced[i] if i < len(forced) else (None, None)
        spec = make_spec(role=role, grade=grade, red_flag=i % (N_BASE // N_REDFLAG) == 3)
        src = rnd.choices(["hh", "habr", "telegram"], weights=[50, 25, 25])[0]
        v = posting(spec, src, rnd.uniform(0, 30), variant=rnd.randint(0, 5))
        vacancies.append(v)
        bases.append((spec, v))

    # cross-platform duplicates
    candidates = [b for b in bases if b[1]["source"] in ("hh", "habr")]
    rnd.shuffle(candidates)
    made = 0
    for spec, orig in candidates:
        if made >= N_DUP:
            break
        others = [s for s in ("hh", "habr", "telegram") if s != orig["source"]]
        n_copies = 2 if made < 10 and made + 2 <= N_DUP else 1
        group = [key(orig)]
        orig_style = next(s for s in range(6) if title_variant(spec, s) == orig["title"])
        for src in rnd.sample(others, n_copies):
            style = (orig_style + rnd.randint(1, 5)) % 6
            d = posting(spec, src, max(0.0, orig["days_ago"] + rnd.uniform(-2, 3)), variant=style, kind="duplicate")
            if d["title"] == orig["title"] and src != "telegram":
                d["title"] = title_variant(spec, style + 1)
            vacancies.append(d)
            group.append(key(d))
            made += 1
        orig["payload"]["kind"] = "duplicate_origin"
        dup_groups.append(group)

    # eternal vacancies: same company+title reposted every 7-14 days for 90-120 days
    eternal_companies = SHADY + [c for c, _ in COMPANIES if c not in SHADY]
    for i in range(N_ETERNAL):
        company = eternal_companies[i % len(eternal_companies)]
        spec = make_spec(company=company, red_flag=company in SHADY)
        span = rnd.uniform(90, 120)
        src = rnd.choices(["hh", "habr", "telegram"], weights=[60, 20, 20])[0]
        style = rnd.randint(0, 5)
        day, ids = span, []
        while day > 0:
            v = posting(spec, src, day, variant=style, kind="eternal")
            vacancies.append(v)
            ids.append(key(v))
            day -= rnd.uniform(7, 14)
        eternal_groups.append({"company": company, "title": title_variant(spec, style), "span_days": round(span, 1), "ids": ids})

    rnd.shuffle(vacancies)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "demo_vacancies.json").write_text(json.dumps(vacancies, ensure_ascii=False, indent=1), encoding="utf-8")
    labels = {
        "seed": SEED,
        "id_format": "<source>:<external_id>",
        "duplicate_groups": dup_groups,
        "eternal_groups": eternal_groups,
        "red_flag_ids": [key(v) for v in vacancies if v["payload"]["red_flags"]],
        "stats": {
            "total": len(vacancies),
            "by_source": {s: sum(v["source"] == s for v in vacancies) for s in ("hh", "habr", "telegram")},
            "duplicate_groups": len(dup_groups),
            "duplicate_postings": sum(len(g) - 1 for g in dup_groups),
            "eternal_groups": len(eternal_groups),
            "eternal_postings": sum(len(g["ids"]) for g in eternal_groups),
            "red_flag": sum(bool(v["payload"]["red_flags"]) for v in vacancies),
            "junior_or_intern": sum(v["payload"]["true_grade"] in ("junior", "intern") for v in vacancies),
            "1c": sum(v["payload"]["role"] == "1c" for v in vacancies),
        },
    }
    (OUT_DIR / "dedup_labels.json").write_text(json.dumps(labels, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(labels["stats"], ensure_ascii=False))


if __name__ == "__main__":
    main()
