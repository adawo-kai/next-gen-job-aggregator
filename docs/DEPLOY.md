# Деплой в продакшен (один VPS)

Нужно:
- VPS с Ubuntu 24.04: 2 vCPU, 4 ГБ RAM, 40 ГБ диска (Hetzner CX22 ≈ €4/мес, Timeweb, Selectel и т.п.).
- Домен или поддомен, например `jobradar.example.com`, с A-записью на IP сервера.
- Токен бота `@NextGenJobAgr_bot`.

## 1. Сервер

```bash
ssh root@SERVER_IP
curl -fsSL https://get.docker.com | sh
git clone https://github.com/adawo-kai/next-gen-job-aggregator.git /opt/jobradar
cd /opt/jobradar
```

## 2. Секреты (`/opt/jobradar/.env`)

```bash
cat > .env <<EOF
DOMAIN=jobradar.example.com
JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
GRAFANA_PASSWORD=$(openssl rand -hex 12)
TELEGRAM_BOT_TOKEN=<токен из BotFather>
TELEGRAM_BOT_USERNAME=NextGenJobAgr_bot
HH_ACCESS_TOKEN=
ANTHROPIC_API_KEY=
EOF
chmod 600 .env
```

## 3. Запуск

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy сам выпустит HTTPS-сертификат. Через 1–2 минуты по адресу `https://DOMAIN` откроется сайт, а Mini App будет доступна по `https://DOMAIN/tg`.
Бот при старте сам ставит кнопку меню «JobRadar», которая открывает Mini App.

## 4. BotFather (один раз)

- `/setdescription`, `/setabouttext`, `/setuserpic`: описание и аватар бота.
- `/newapp` → выбрать бота → URL `https://DOMAIN/tg`, short name `app`. Тогда работают прямые ссылки `https://t.me/NextGenJobAgr_bot/app` и `...?startapp=v_123` (откроет вакансию 123).

## 5. Обслуживание

| Задача | Команда |
|---|---|
| Обновить до свежего `main` | `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` |
| Логи | `docker compose logs -f api bot worker-collect` |
| Бэкапы БД | ежедневно в volume `backups`, хранятся 14 дней: `docker compose exec backup ls /backups` |
| Восстановить | `gunzip -c jobs-DATE.sql.gz \| docker compose exec -T postgres psql -U jobs jobs` |
| Grafana и Flower | `ssh -L 3001:localhost:3001 -L 5555:localhost:5555 root@SERVER_IP`, затем открыть http://localhost:3001 (логин admin, пароль `GRAFANA_PASSWORD`) и http://localhost:5555 |

Наружу открыты только порты 80 и 443. Grafana и Flower слушают только 127.0.0.1 сервера. Postgres и Redis доступны только внутри docker-сети.
