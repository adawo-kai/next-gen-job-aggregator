import type {
  Format,
  Grade,
  MarketAnalytics,
  RedFlag,
  VacancyCard,
  VacancyDetail,
} from "./types";

type Seed = {
  title: string;
  company: string;
  trust: number;
  from: number | null;
  to: number | null;
  currency?: "RUB" | "USD" | "EUR";
  grade: Grade;
  format: Format;
  city: string;
  must: string[];
  nice: string[];
  sources: ("hh" | "habr" | "telegram")[];
  water: number;
  flags?: (keyof typeof FLAGS)[];
  ghost?: number; // repost count
  hoursAgo: number;
  what: string[];
  conditions: string[];
};

const FLAGS = {
  overtime: { code: "overtime", title: "Переработки", evidence: "«готовность работать в режиме многозадачности и ненормированного дня»" },
  family: { code: "we_are_family", title: "«Мы — семья»", evidence: "«у нас не просто команда, мы — настоящая семья»" },
  grey_salary: { code: "grey_salary", title: "Серая зарплата", evidence: "«оклад + премии по итогам, оформление обсуждается»" },
  stress: { code: "stress_resistance", title: "Стрессоустойчивость", evidence: "«высокая стрессоустойчивость и умение работать в условиях дедлайнов»" },
  unpaid_test: { code: "big_test_task", title: "Большое тестовое", evidence: "«тестовое задание на 3–5 дней, без оплаты»" },
  hidden_salary: { code: "hidden_salary", title: "Скрытая зарплата", evidence: "«уровень дохода обсуждается по итогам собеседования»" },
  wide_stack: { code: "unicorn", title: "Сотрудник-единорог", evidence: "требуют 14 технологий из 4 разных стеков" },
} satisfies Record<string, RedFlag>;

const SEEDS: Seed[] = [
  { title: "Senior Python Developer (FastAPI)", company: "Тинькофф", trust: 91, from: 350000, to: 480000, grade: "senior", format: "remote", city: "Москва", must: ["Python", "FastAPI", "PostgreSQL", "asyncio"], nice: ["Kafka", "Kubernetes"], sources: ["hh", "habr", "telegram"], water: 14, hoursAgo: 2, what: ["Проектировать и развивать платёжные микросервисы на FastAPI", "Оптимизировать запросы к PostgreSQL под нагрузку 20k RPS", "Ревьюить код и менторить двух middle-разработчиков"], conditions: ["Полная удалёнка внутри РФ", "ДМС со стоматологией с первого дня", "Бюджет на конференции 150 000 ₽ в год"] },
  { title: "Frontend Developer (React / Next.js)", company: "Яндекс", trust: 94, from: 280000, to: 400000, grade: "middle", format: "hybrid", city: "Москва", must: ["React", "TypeScript", "Next.js"], nice: ["GraphQL", "Playwright"], sources: ["hh", "habr"], water: 9, hoursAgo: 5, what: ["Разрабатывать интерфейсы Яндекс Маркета для 30 млн пользователей", "Ускорять загрузку страниц и улучшать Core Web Vitals", "Писать e2e-тесты на Playwright"], conditions: ["Гибрид: 2 дня в офисе", "Годовой бонус до 20%", "Опционы для сильных"] },
  { title: "Go Backend Engineer", company: "Ozon Tech", trust: 86, from: 300000, to: 420000, grade: "senior", format: "remote", city: "Санкт-Петербург", must: ["Go", "gRPC", "PostgreSQL", "Kafka"], nice: ["ClickHouse", "Kubernetes"], sources: ["habr", "telegram"], water: 18, hoursAgo: 9, what: ["Строить сервисы логистики, обрабатывающие миллионы заказов", "Проектировать event-driven архитектуру на Kafka", "Участвовать в on-call ротации"], conditions: ["Удалённо или офис в СПб", "Компенсация спорта", "Релокационный пакет"] },
  { title: "Python-разработчик в динамичную команду", company: "ООО «ТехноСтарт»", trust: 28, from: null, to: null, grade: "middle", format: "office", city: "Москва", must: ["Python", "Django"], nice: ["Docker"], sources: ["hh"], water: 78, flags: ["family", "overtime", "stress", "hidden_salary"], ghost: 9, hoursAgo: 30, what: ["Поддержка внутренних сервисов компании", "Участие в интересных проектах", "Работа в дружном коллективе"], conditions: ["Офис в центре", "Печеньки и чай", "Дружный коллектив"] },
  { title: "Data Engineer (Spark, Airflow)", company: "Сбер", trust: 82, from: 320000, to: 450000, grade: "senior", format: "hybrid", city: "Москва", must: ["Python", "Spark", "Airflow", "SQL"], nice: ["Hadoop", "dbt"], sources: ["hh", "habr", "telegram"], water: 22, hoursAgo: 3, what: ["Строить DWH для розничного бизнеса", "Автоматизировать пайплайны на Airflow", "Оптимизировать Spark-джобы на кластере 400 нод"], conditions: ["Гибрид", "Годовая премия", "Льготная ипотека"] },
  { title: "ML Engineer (NLP, LLM)", company: "VK", trust: 79, from: 5000, to: 7500, currency: "USD", grade: "senior", format: "remote", city: "Москва", must: ["Python", "PyTorch", "NLP", "LLM"], nice: ["Triton", "CUDA"], sources: ["habr"], water: 12, hoursAgo: 14, what: ["Дообучать LLM для поиска и рекомендаций", "Строить RAG-пайплайны для поддержки", "Выводить модели в прод с latency < 100 мс"], conditions: ["Удалёнка из любой страны", "GPU-кластер под эксперименты", "Публикации на конференциях"] },
  { title: "DevOps / SRE Engineer", company: "Kaspersky", trust: 88, from: 280000, to: 380000, grade: "middle", format: "hybrid", city: "Москва", must: ["Kubernetes", "Terraform", "Linux", "Prometheus"], nice: ["Go", "Ansible"], sources: ["hh", "telegram"], water: 16, hoursAgo: 20, what: ["Поддерживать k8s-кластеры на 3000 подов", "Внедрять GitOps на ArgoCD", "Строить мониторинг и алертинг"], conditions: ["Гибрид", "ДМС для семьи", "Обучение за счёт компании"] },
  { title: "Junior Frontend-разработчик", company: "Skyeng", trust: 74, from: 90000, to: 130000, grade: "junior", format: "remote", city: "Москва", must: ["JavaScript", "React", "CSS"], nice: ["TypeScript"], sources: ["hh", "habr"], water: 25, hoursAgo: 7, what: ["Верстать и развивать личный кабинет ученика", "Исправлять баги и писать unit-тесты", "Работать в паре с senior-разработчиком"], conditions: ["Полная удалёнка", "Бесплатные уроки английского", "Ментор на испытательный срок"] },
  { title: "Java Developer (Spring Boot)", company: "Альфа-Банк", trust: 80, from: 250000, to: 350000, grade: "middle", format: "office", city: "Москва", must: ["Java", "Spring Boot", "PostgreSQL"], nice: ["Kafka", "Kotlin"], sources: ["hh"], water: 31, flags: ["stress"], hoursAgo: 26, what: ["Развивать кредитный конвейер", "Интегрироваться с внешними бюро", "Покрывать код тестами"], conditions: ["Офис у м. Белорусская", "Годовой бонус", "Корпоративный спортзал"] },
  { title: "Fullstack Engineer (Node.js + React)", company: "Avito", trust: 90, from: null, to: null, grade: "middle", format: "remote", city: "Москва", must: ["Node.js", "React", "TypeScript"], nice: ["PostgreSQL", "Redis"], sources: ["habr", "telegram"], water: 15, hoursAgo: 11, what: ["Делать инструменты для продавцов Авито", "Проектировать API и фронтенд end-to-end", "Проводить A/B-эксперименты"], conditions: ["Удалённо", "Конкурентная зарплата", "Курсы и конференции"] },
  { title: "Head of Engineering", company: "Цифровые Решения", trust: 34, from: 600000, to: 900000, grade: "lead", format: "office", city: "Казань", must: ["Management", "Python", "Java", "Go", "React"], nice: ["Kubernetes"], sources: ["telegram"], water: 69, flags: ["wide_stack", "overtime", "grey_salary"], ghost: 6, hoursAgo: 50, what: ["Руководить всеми командами разработки", "Самостоятельно писать код на всех языках", "Отвечать за продажи и пресейлы"], conditions: ["Офис в Казани", "Высокий уровень дохода", "Возможность роста"] },
  { title: "QA Automation Engineer (Python)", company: "Positive Technologies", trust: 85, from: 200000, to: 290000, grade: "middle", format: "remote", city: "Москва", must: ["Python", "pytest", "Selenium"], nice: ["Playwright", "Allure"], sources: ["hh", "habr"], water: 20, hoursAgo: 4, what: ["Автоматизировать тестирование продуктов ИБ", "Развивать фреймворк на pytest", "Встраивать тесты в CI"], conditions: ["Удалёнка", "ДМС", "Гибкое начало дня"] },
  { title: "iOS Developer (Swift)", company: "Wildberries", trust: 58, from: 300000, to: 400000, grade: "senior", format: "office", city: "Москва", must: ["Swift", "UIKit", "SwiftUI"], nice: ["Combine"], sources: ["hh", "habr", "telegram"], water: 37, flags: ["overtime"], ghost: 4, hoursAgo: 16, what: ["Развивать мобильное приложение маркетплейса", "Переводить экраны на SwiftUI", "Оптимизировать стартап приложения"], conditions: ["Офис", "Бонусы по KPI", "Скидки сотрудникам"] },
  { title: "Аналитик данных (SQL, Python)", company: "X5 Tech", trust: 77, from: 180000, to: 260000, grade: "middle", format: "hybrid", city: "Москва", must: ["SQL", "Python", "Pandas"], nice: ["Superset", "ClickHouse"], sources: ["hh"], water: 27, hoursAgo: 33, what: ["Считать эффективность промо-акций", "Строить дашборды для категорийных менеджеров", "Проводить A/B-тесты"], conditions: ["Гибрид", "Квартальные премии", "ДМС"] },
  { title: "Senior Rust Engineer", company: "Kaspersky", trust: 88, from: 400000, to: 550000, grade: "senior", format: "remote", city: "Москва", must: ["Rust", "Linux", "tokio"], nice: ["C++", "eBPF"], sources: ["habr"], water: 11, hoursAgo: 8, what: ["Писать высоконагруженный сетевой агент на Rust", "Профилировать и оптимизировать", "Участвовать в архитектурных ревью"], conditions: ["Удалёнка", "Бонусы", "Релокация в Дубай по желанию"] },
  { title: "PHP-программист (Битрикс)", company: "Веб-Студия Пиксель", trust: 41, from: 80000, to: 120000, grade: "junior", format: "office", city: "Новосибирск", must: ["PHP", "1С-Битрикс", "MySQL"], nice: ["Vue"], sources: ["hh", "telegram"], water: 63, flags: ["unpaid_test", "family"], ghost: 7, hoursAgo: 40, what: ["Поддержка сайтов клиентов на Битрикс", "Доработка интернет-магазинов", "Общение с клиентами"], conditions: ["Офис", "Испытательный срок 3 месяца", "Обучение"] },
  { title: "Product Designer → Frontend (TypeScript)", company: "Т-Банк", trust: 91, from: 260000, to: 340000, grade: "middle", format: "remote", city: "Москва", must: ["TypeScript", "React", "Figma"], nice: ["Storybook"], sources: ["telegram"], water: 19, hoursAgo: 1, what: ["Собирать дизайн-систему банка в коде", "Синхронизировать токены Figma и кода", "Писать Storybook-документацию"], conditions: ["Удалёнка", "ДМС", "Обучение в Т-Академии"] },
  { title: "Kotlin Android Developer", company: "Сбер", trust: 82, from: 270000, to: 370000, grade: "middle", format: "hybrid", city: "Санкт-Петербург", must: ["Kotlin", "Android", "Coroutines"], nice: ["Jetpack Compose"], sources: ["hh", "habr"], water: 23, hoursAgo: 19, what: ["Развивать СберБанк Онлайн для Android", "Переводить экраны на Compose", "Работать с модульной архитектурой"], conditions: ["Гибрид", "Премии", "Льготы банка"] },
  { title: "Team Lead Python", company: "Ozon Tech", trust: 86, from: 500000, to: 650000, grade: "lead", format: "remote", city: "Москва", must: ["Python", "Management", "PostgreSQL", "Kafka"], nice: ["Go"], sources: ["hh", "habr", "telegram"], water: 13, hoursAgo: 6, what: ["Руководить командой из 7 разработчиков", "Отвечать за техническую стратегию сервиса цен", "Нанимать и развивать людей"], conditions: ["Удалёнка", "RSU", "Бюджет на обучение команды"] },
  { title: "1C-разработчик", company: "Компания Рост", trust: 39, from: 150000, to: 220000, grade: "middle", format: "office", city: "Екатеринбург", must: ["1С", "SQL"], nice: [], sources: ["hh"], water: 58, flags: ["grey_salary", "stress"], ghost: 11, hoursAgo: 70, what: ["Доработка конфигураций 1С:ERP", "Интеграции с маркетплейсами", "Поддержка пользователей"], conditions: ["Офис", "Оклад + премии", "Корпоративы"] },
  { title: "Middle Python Developer (Django)", company: "Skyeng", trust: 74, from: 200000, to: 280000, grade: "middle", format: "remote", city: "Москва", must: ["Python", "Django", "PostgreSQL"], nice: ["Celery", "Redis"], sources: ["hh", "habr"], water: 21, hoursAgo: 12, what: ["Развивать платформу онлайн-уроков", "Писать API для мобильных приложений", "Оптимизировать медленные запросы"], conditions: ["Удалёнка", "Английский бесплатно", "Гибкий график"] },
  { title: "Security Engineer (AppSec)", company: "Positive Technologies", trust: 85, from: 320000, to: 440000, grade: "senior", format: "hybrid", city: "Москва", must: ["AppSec", "Python", "OWASP"], nice: ["Go", "Kubernetes"], sources: ["habr", "telegram"], water: 17, hoursAgo: 22, what: ["Встраивать SAST/DAST в CI/CD", "Проводить ревью безопасности архитектуры", "Обучать разработчиков безопасному коду"], conditions: ["Гибрид", "ДМС", "Конференция Positive Hack Days"] },
  { title: "Стажёр-разработчик Python", company: "Яндекс", trust: 94, from: 70000, to: 90000, grade: "intern", format: "hybrid", city: "Москва", must: ["Python", "Алгоритмы"], nice: ["SQL", "Git"], sources: ["hh", "habr", "telegram"], water: 10, hoursAgo: 15, what: ["Решать реальные задачи команды поиска", "Учиться у опытных наставников", "Писать код в продакшн уже в первый месяц"], conditions: ["Оплачиваемая стажировка", "Гибкий график для студентов", "Возможность оффера"] },
  { title: "C++ Developer (HFT)", company: "Финам", trust: 63, from: 4000, to: 6000, currency: "EUR", grade: "senior", format: "office", city: "Москва", must: ["C++", "Linux", "Multithreading"], nice: ["FPGA"], sources: ["telegram"], water: 29, flags: ["stress"], hoursAgo: 28, what: ["Писать торговые системы с латентностью в микросекундах", "Оптимизировать сетевой стек", "Работать с биржевыми протоколами"], conditions: ["Офис в Москва-Сити", "Бонусы от PnL", "Сильная команда"] },
  { title: "Vue.js Developer", company: "Лаборатория Сайтов", trust: 47, from: 150000, to: 210000, grade: "middle", format: "remote", city: "Краснодар", must: ["Vue", "JavaScript", "Nuxt"], nice: ["TypeScript"], sources: ["hh", "telegram"], water: 48, flags: ["unpaid_test"], ghost: 5, hoursAgo: 45, what: ["Разработка SPA для клиентов агентства", "Интеграция с REST API", "Поддержка legacy-проектов"], conditions: ["Удалёнка", "Проектные бонусы", "Гибкий график"] },
  { title: "Platform Engineer (Kubernetes, Go)", company: "Avito", trust: 90, from: 380000, to: 520000, grade: "senior", format: "remote", city: "Москва", must: ["Go", "Kubernetes", "Terraform"], nice: ["Prometheus", "Istio"], sources: ["habr"], water: 12, hoursAgo: 10, what: ["Строить внутреннюю PaaS для 1000 сервисов", "Развивать деплой-платформу", "Автоматизировать capacity planning"], conditions: ["Удалённо", "Опционы", "Ежегодный пересмотр"] },
  { title: "Python-разработчик (парсинг, Scrapy)", company: "DataHunter", trust: 55, from: 160000, to: 230000, grade: "middle", format: "remote", city: "Минск", must: ["Python", "Scrapy", "PostgreSQL"], nice: ["Playwright", "Redis"], sources: ["telegram", "hh"], water: 33, hoursAgo: 18, what: ["Писать краулеры для 200+ источников", "Обходить антибот-защиту", "Строить пайплайны нормализации данных"], conditions: ["Удалёнка", "Оплата в USD", "Гибкий график"] },
  { title: "Lead Frontend Engineer", company: "Lamoda Tech", trust: 76, from: 420000, to: 560000, grade: "lead", format: "hybrid", city: "Москва", must: ["React", "TypeScript", "Architecture"], nice: ["Micro-frontends", "Next.js"], sources: ["hh", "habr"], water: 20, hoursAgo: 24, what: ["Вести фронтенд-команду из 6 человек", "Мигрировать на микрофронтенды", "Определять стандарты качества кода"], conditions: ["Гибрид", "Скидка 30% на ассортимент", "Бонусы"] },
  { title: "Golang Developer", company: "Рога и Копыта Диджитал", trust: 22, from: null, to: null, grade: "senior", format: "office", city: "Москва", must: ["Go", "PostgreSQL", "Kafka", "Kubernetes", "React", "Python"], nice: ["Java"], sources: ["hh", "habr", "telegram"], water: 84, flags: ["wide_stack", "family", "hidden_salary", "overtime"], ghost: 14, hoursAgo: 60, what: ["Разработка различных сервисов", "Участие во всех этапах жизненного цикла", "Решение нестандартных задач"], conditions: ["Конкурентная зарплата", "Молодой дружный коллектив", "Карьерный рост"] },
  { title: "MLOps Engineer", company: "Сбер", trust: 82, from: 330000, to: 460000, grade: "senior", format: "remote", city: "Москва", must: ["Python", "Kubernetes", "MLflow", "Docker"], nice: ["Kubeflow", "Triton"], sources: ["habr", "telegram"], water: 18, hoursAgo: 13, what: ["Строить платформу обучения и деплоя моделей", "Автоматизировать мониторинг дрейфа", "Оптимизировать инференс на GPU"], conditions: ["Удалёнка", "Премии", "Доступ к GPU-кластеру"] },
  { title: "Junior Python Developer", company: "Selectel", trust: 84, from: 110000, to: 150000, grade: "junior", format: "hybrid", city: "Санкт-Петербург", must: ["Python", "SQL", "Git"], nice: ["FastAPI", "Docker"], sources: ["hh"], water: 19, hoursAgo: 0.5, what: ["Развивать API облачной панели", "Писать автотесты", "Разбираться в инфраструктуре дата-центров"], conditions: ["Гибрид", "Ментор", "Компенсация обучения"] },
  { title: "Senior Data Scientist (Recsys)", company: "Wildberries", trust: 58, from: null, to: null, grade: "senior", format: "remote", city: "Москва", must: ["Python", "ML", "SQL", "Recsys"], nice: ["Spark"], sources: ["hh", "habr"], water: 35, hoursAgo: 36, what: ["Улучшать рекомендации на главной", "Ставить онлайн A/B-эксперименты", "Внедрять нейросетевые ранжировщики"], conditions: ["Удалёнка", "Бонусы", "Большие данные"] },
];

const RATES: Record<string, number> = { RUB: 1, USD: 92, EUR: 99, KZT: 0.19, KGS: 1.05 };
const MARKET: Record<Grade, [number, number, number]> = {
  intern: [60000, 80000, 100000],
  junior: [95000, 130000, 165000],
  middle: [190000, 250000, 320000],
  senior: [300000, 380000, 470000],
  lead: [420000, 540000, 680000],
};

const SOURCE_URL: Record<string, string> = {
  hh: "https://hh.ru/vacancy/",
  habr: "https://career.habr.com/vacancies/",
  telegram: "https://t.me/s/",
};

const MERGE_REASONS = [
  "title 0.94 · embedding 0.91 · та же компания",
  "title 0.88 · embedding 0.86 · зарплата совпадает",
  "точный хеш: компания + заголовок + стек",
  "title 0.81 · embedding 0.89 · город совпадает",
];

let seedHour = 0;
const BASE = Date.now();
function iso(hoursAgo: number) {
  return new Date(BASE - hoursAgo * 3600_000).toISOString();
}

function build(seed: Seed, i: number): VacancyDetail {
  seedHour = seed.hoursAgo;
  const id = 1000 + i;
  const cur = seed.currency ?? "RUB";
  const rate = RATES[cur];
  const estimated = seed.from == null && seed.to == null;
  const m = MARKET[seed.grade];
  const tg = ["python_jobs", "devjobs", "it_vacancies_ru"][i % 3];
  const sources = seed.sources.map((s, k) => ({
    source: s,
    url: s === "telegram" ? `${SOURCE_URL.telegram}${tg}/${4200 + i * 7}` : `${SOURCE_URL[s]}${9_100_000 + i * 131 + k}`,
    published_at: iso(seedHour + k * 3.5),
  }));
  const flags: RedFlag[] = (seed.flags ?? []).map((f) => FLAGS[f]);
  const isGhost = (seed.ghost ?? 0) >= 4;
  const tags = [...seed.must, ...seed.nice];
  const desc = [
    `${seed.company} ищет ${seed.title}.`,
    "",
    "Чем предстоит заниматься:",
    ...seed.what.map((w) => `• ${w}`),
    "",
    "Что мы ждём:",
    ...seed.must.map((s) => `• Опыт коммерческой разработки с ${s}`),
    ...seed.nice.map((s) => `• Будет плюсом: ${s}`),
    "",
    "Условия:",
    ...seed.conditions.map((c) => `• ${c}`),
  ];
  return {
    id,
    title: seed.title,
    company: { id: 100 + (hashCode(seed.company) % 900), name: seed.company, trust_score: seed.trust, logo_url: null },
    salary: estimated
      ? { from: m[0], to: m[2], currency: "RUB", rub_from: m[0], rub_to: m[2], converted_from: null, converted_to: null, display_currency: "RUB", estimated: true, gross: null }
      : {
          from: seed.from,
          to: seed.to,
          currency: cur,
          rub_from: seed.from != null ? Math.round(seed.from * rate) : null,
          rub_to: seed.to != null ? Math.round(seed.to * rate) : null,
          converted_from: null,
          converted_to: null,
          display_currency: cur,
          estimated: false,
          gross: i % 3 === 0,
        },
    grade: seed.grade,
    format: seed.format,
    city: seed.city,
    country: seed.city === "Минск" ? "Беларусь" : "Россия",
    tags,
    sources,
    published_at: iso(seedHour),
    first_seen_at: iso(isGhost ? seedHour + 24 * 30 * ((seed.ghost ?? 0) / 3) : seedHour),
    water_score: seed.water,
    red_flags: flags,
    is_ghost: isGhost,
    ghost_reason: isGhost
      ? `Перепубликована ${seed.ghost} раз за ${Math.round((seed.ghost ?? 0) / 3 + 1)} мес. без изменений в тексте`
      : null,
    repost_count: seed.ghost ?? 0,
    match_score: null,
    summary: {
      what_to_do: seed.what,
      requirements: [
        ...seed.must.slice(0, 3).map((s) => `Уверенный ${s}`),
        seed.grade === "senior" || seed.grade === "lead" ? "Опыт от 5 лет" : seed.grade === "middle" ? "Опыт от 2–3 лет" : "Готовность учиться",
      ],
      conditions: seed.conditions,
    },
    description_text: desc.join("\n"),
    description_html: desc.map((l) => (l ? `<p>${l}</p>` : "")).join(""),
    must_have: seed.must,
    nice_to_have: seed.nice,
    enrichment: {
      model: i % 4 === 3 ? "rules-v2" : "claude-haiku-4-5",
      method: i % 4 === 3 ? "rules" : "llm",
      prompt_version: "enrich-v3",
      enriched_at: iso(Math.max(seedHour - 0.2, 0)),
    },
    dedup: {
      cluster_size: sources.length,
      merged: sources.map((s, k) => ({
        source: s.source,
        url: s.url,
        reason: k === 0 ? "каноническая запись" : MERGE_REASONS[(i + k) % MERGE_REASONS.length],
        score: k === 0 ? 1 : Math.round((0.97 - ((i + k) % 5) * 0.035) * 100) / 100,
      })),
    },
    salary_market: { p25: m[0], p50: m[1], p75: m[2], currency: "RUB", sample: 120 + ((i * 37) % 400) },
  };
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export const MOCK_VACANCIES: VacancyDetail[] = SEEDS.map(build);

export function toCard(v: VacancyDetail): VacancyCard {
  const {
    description_html: _a,
    description_text: _b,
    must_have: _c,
    nice_to_have: _d,
    enrichment: _e,
    dedup: _f,
    salary_market: _g,
    ...card
  } = v;
  void _a; void _b; void _c; void _d; void _e; void _f; void _g;
  return card;
}

export const MOCK_RATES = RATES;

export function mockMarket(): MarketAnalytics {
  const counts = new Map<string, { count: number; salaries: number[] }>();
  for (const v of MOCK_VACANCIES) {
    for (const t of v.tags) {
      const e = counts.get(t) ?? { count: 0, salaries: [] };
      e.count++;
      const mid = v.salary.rub_from && v.salary.rub_to ? (v.salary.rub_from + v.salary.rub_to) / 2 : v.salary.rub_from ?? v.salary.rub_to;
      if (mid) e.salaries.push(mid);
      counts.set(t, e);
    }
  }
  const scale = 41; // pretend dataset is bigger than the 31 seeds
  const top = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([skill, e]) => ({
      skill,
      count: e.count * scale + (hashCode(skill) % 37),
      median_salary_rub: e.salaries.length ? Math.round(median(e.salaries) / 1000) * 1000 : null,
    }));
  const trend = Array.from({ length: 30 }, (_, k) => {
    const d = new Date(BASE - (29 - k) * 86400_000);
    const weekday = d.getDay();
    const base = 380 + k * 6 + Math.round(Math.sin(k / 2.3) * 40);
    return { date: d.toISOString().slice(0, 10), count: weekday === 0 || weekday === 6 ? Math.round(base * 0.55) : base };
  });
  return {
    totals: { vacancies: 12847, companies: 2316, sources: 3, merged_duplicates: 3921, ghosts: 1184 },
    top_skills: top,
    salary_by_grade: (Object.keys(MARKET) as Grade[]).map((g, k) => ({
      grade: g,
      p25: MARKET[g][0],
      p50: MARKET[g][1],
      p75: MARKET[g][2],
      count: [410, 2380, 5120, 3870, 1067][k],
    })),
    by_source: [
      { source: "hh", count: 7420, errors_24h: 3 },
      { source: "habr", count: 3315, errors_24h: 0 },
      { source: "telegram", count: 2112, errors_24h: 12 },
    ],
    by_format: [
      { format: "remote", count: 5980 },
      { format: "hybrid", count: 3870 },
      { format: "office", count: 2997 },
    ],
    trend,
  };
}

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
