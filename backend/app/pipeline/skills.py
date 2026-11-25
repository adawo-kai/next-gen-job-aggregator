"""Skill taxonomy: canonical names + synonyms (RU/EN, slang, typos).

Used by the rule-based extractor, by LLM output normalisation and by matching,
so "k8s", "кубер" and "Kubernetes" are the same skill everywhere.
"""

from __future__ import annotations

import re

TAXONOMY: dict[str, list[str]] = {
    "Python": ["python", "python3", "питон", "пайтон"],
    "Go": ["golang", "go", "гоу"],
    "Java": ["java", "джава"],
    "Kotlin": ["kotlin", "котлин"],
    "Scala": ["scala"],
    "C#": ["c#", "csharp", ".net", "dotnet", "asp.net"],
    "C++": ["c++", "cpp", "плюсы"],
    "Rust": ["rust", "раст"],
    "PHP": ["php", "пхп"],
    "Ruby": ["ruby", "rails", "ruby on rails"],
    "JavaScript": ["javascript", "js", "es6", "ecmascript"],
    "TypeScript": ["typescript", "ts"],
    "Node.js": ["node.js", "nodejs", "node", "нода"],
    "React": ["react", "react.js", "reactjs", "реакт"],
    "Vue": ["vue", "vue.js", "vuejs", "nuxt", "вью"],
    "Angular": ["angular"],
    "Next.js": ["next.js", "nextjs"],
    "Swift": ["swift", "swiftui"],
    "Flutter": ["flutter", "dart"],
    "Android": ["android"],
    "iOS": ["ios"],
    "Django": ["django", "джанго", "drf"],
    "FastAPI": ["fastapi"],
    "Flask": ["flask"],
    "Spring": ["spring", "spring boot", "springboot"],
    "PostgreSQL": ["postgresql", "postgres", "постгрес", "постгре", "pg", "psql"],
    "MySQL": ["mysql"],
    "MongoDB": ["mongodb", "mongo"],
    "Redis": ["redis", "редис"],
    "ClickHouse": ["clickhouse", "кликхаус"],
    "Elasticsearch": ["elasticsearch", "elastic", "opensearch"],
    "Kafka": ["kafka", "кафка"],
    "RabbitMQ": ["rabbitmq", "rabbit", "кролик"],
    "Celery": ["celery"],
    "Docker": ["docker", "докер"],
    "Kubernetes": ["kubernetes", "k8s", "кубер", "кубернетес", "helm"],
    "Terraform": ["terraform"],
    "Ansible": ["ansible"],
    "CI/CD": ["ci/cd", "cicd", "gitlab ci", "github actions", "jenkins"],
    "Linux": ["linux", "линукс", "unix"],
    "AWS": ["aws", "amazon web services"],
    "GCP": ["gcp", "google cloud"],
    "Yandex Cloud": ["yandex cloud", "яндекс облако"],
    "Prometheus": ["prometheus", "grafana"],
    "SQL": ["sql"],
    "Git": ["git"],
    "REST": ["rest", "rest api", "restful"],
    "gRPC": ["grpc"],
    "GraphQL": ["graphql"],
    "Microservices": ["microservices", "микросервисы", "микросервисная"],
    "Machine Learning": ["machine learning", "ml", "машинное обучение"],
    "PyTorch": ["pytorch", "torch"],
    "TensorFlow": ["tensorflow"],
    "LLM": ["llm", "gpt", "langchain", "rag"],
    "Pandas": ["pandas", "numpy"],
    "Spark": ["spark", "pyspark", "hadoop"],
    "Airflow": ["airflow"],
    "Data Analysis": ["data analysis", "аналитика данных", "tableau", "power bi", "superset"],
    "QA": ["qa", "тестирование", "testing"],
    "Selenium": ["selenium", "playwright", "cypress"],
    "Figma": ["figma", "фигма"],
    "1C": ["1с", "1c", "1с:предприятие", "1c:enterprise"],
    "HTML/CSS": ["html", "css", "scss", "sass", "tailwind"],
    "Redux": ["redux", "mobx", "zustand"],
    "Webpack": ["webpack", "vite"],
    "Nginx": ["nginx"],
    "Asyncio": ["asyncio", "aiohttp"],
    "SQLAlchemy": ["sqlalchemy", "alembic"],
}

_ALIASES: dict[str, str] = {}
for canon, aliases in TAXONOMY.items():
    _ALIASES[canon.lower()] = canon
    for a in aliases:
        _ALIASES[a.lower()] = canon

# ambiguous short tokens only count when written as a standalone tech word
_AMBIGUOUS = {"go", "ts", "js", "ml", "pg", "qa", "git", "rest", "node", "rabbit", "elastic", "spring", "ios", "sql"}

_TOKEN_RE = re.compile(r"(?<![\w.#+])([a-zA-Zа-яА-ЯёЁ0-9][\w.#+/:-]*(?:\s(?:boot|on rails|cloud|web services|ci|actions|bi|learning|api|обучение|данных|облако))?)", re.U)


def canonical(skill: str) -> str | None:
    s = skill.strip().strip(".,;:()[]").lower()
    s = s.lstrip("#")
    return _ALIASES.get(s)


def normalize_list(skills: list[str]) -> list[str]:
    out: list[str] = []
    for sk in skills:
        c = canonical(sk) or (sk.strip() if 1 < len(sk.strip()) <= 40 else None)
        if c and c not in out:
            out.append(c)
    return out


_MULTI = sorted((a for a in _ALIASES if " " in a or "/" in a or "." in a or ":" in a), key=len, reverse=True)


def extract(text: str) -> list[str]:
    """Rule-based skill extraction keeping first-mention order."""
    low = text.lower()
    found: dict[str, int] = {}
    for alias in _MULTI:
        pos = low.find(alias)
        if pos >= 0:
            found.setdefault(_ALIASES[alias], pos)
    for m in re.finditer(r"(?<![\w#+.])([a-zа-яё0-9#+]+)(?![\w#+])", low):
        tok = m.group(1)
        canon = _ALIASES.get(tok)
        if not canon:
            continue
        if tok in _AMBIGUOUS:
            # "go" is a very common english word; demand tech context
            window = low[max(0, m.start() - 25): m.end() + 25]
            if tok == "go" and not re.search(r"golang|разраб|developer|go\s*(?:,|/|\)|разработ)|backend|на go|go-", window):
                continue
        found.setdefault(canon, m.start())
    return [k for k, _ in sorted(found.items(), key=lambda kv: kv[1])]
