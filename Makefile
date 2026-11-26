.PHONY: up down logs test eval collect reset

up:            ## build & start everything
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api worker-collect worker-pipeline bot

test:          ## unit tests inside the backend image
	docker compose exec api python -m pytest -q --cov=app

eval:          ## dedup precision/recall + ghost detector on labelled demo data
	docker compose exec api python -m scripts.eval_dedup

collect:       ## trigger live collection now
	docker compose exec api python -c "from app.worker import celery; [celery.send_task('jobs.collect', args=[s], queue=f'collect.{s}') for s in ('habr','telegram','hh')]"

reset:         ## wipe DB volume and start from scratch
	docker compose down -v && docker compose up -d --build
