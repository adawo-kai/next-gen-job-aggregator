"""Relevance gate: the aggregator is about IT jobs, general job boards also carry sales/ops roles.

A posting passes when its title names an IT role, or when the text carries enough real tech
skills (soft skills and business terms from source tags don't count).
"""

from __future__ import annotations

import re

from app.pipeline import skills as sk
from app.pipeline.normalize import Normalized

IT_TITLE = re.compile(
    r"разработ|программист|developer|\bdev\b|engineer|инженер|архитект|architect|devops|\bsre\b|"
    r"\bqa\b|тестировщ|тестирован|\btest|аналитик|analyst|\bdata|\bдата|\bml\b|\bai\b|\bllm\b|"
    r"machine learning|машинн|backend|бэкенд|бекенд|frontend|фронтенд|fullstack|фулстек|full-stack|"
    r"\bios\b|android|mobile|мобильн|\bgo\b|golang|python|java|kotlin|php|ruby|rust|\bc\+\+|\bc#|\.net|"
    r"node|react|vue|angular|typescript|javascript|1с|1c|\bsap\b|\berp\b|crm-систем|администратор|admin|"
    r"системн|сетев|network|security|безопасност|pentest|пентест|tech ?lead|техлид|тимлид|team ?lead|\bcto\b|"
    r"product (?:manager|owner)|продакт|менеджер продукт|руководитель продукт|технический писатель|technical writer|работе с данн|"
    r"\bданных\b|менеджер проект\w* (?:в it|разработ)|project manager|проджект|scrum|agile|\bux\b|\bui\b|дизайнер интерф|"
    r"product designer|gamedev|unity|unreal|геймдев|embedded|встраива|верстальщик|web|веб|\bit\b|\bит\b|"
    r"support engineer|техподдерж|helpdesk|\bdba\b|баз данных|database|cloud|облач|kubernetes|platform",
    re.I,
)
# tags that sources attach but that alone say nothing about an IT role
SOFT = {"Machine Learning"}


def is_it(n: Normalized) -> bool:
    if IT_TITLE.search(n.title):
        return True
    tech = [s for s in n.skills if s in sk.TAXONOMY and s not in SOFT]
    return len(tech) >= 2
