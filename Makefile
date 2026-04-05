.PHONY: up down build rebuild logs restart reset \
        infra migrate migrate-prod studio seed \
        shell-api shell-web shell-db \
        dev dev-api dev-web lint typecheck test

# ── Docker ───────────────────────────────────────────────────────────────────

## Start all services (build if needed)
up:
	docker compose up -d

## Start only infrastructure: postgres, redis, minio, mailhog
infra:
	docker compose up -d postgres redis minio mailhog

## Stop all services
down:
	docker compose down

## Build (or rebuild) all Docker images
build:
	docker compose build

## Rebuild images without cache
rebuild:
	docker compose build --no-cache

## Follow logs (optionally filter: make logs s=api)
logs:
	docker compose logs -f $(s)

## Restart a service: make restart s=api
restart:
	docker compose restart $(s)

## Remove containers and volumes (full data reset)
reset:
	docker compose down -v

# ── Database ─────────────────────────────────────────────────────────────────

## Run migrations in development mode
migrate:
	npm run db:migrate

## Deploy migrations (production)
migrate-prod:
	docker compose exec api npx prisma migrate deploy

## Open Prisma Studio
studio:
	npm run db:studio

## Seed the database
seed:
	npm run db:seed --workspace=apps/api

# ── Shells ───────────────────────────────────────────────────────────────────

## Open a shell in the API container
shell-api:
	docker compose exec api sh

## Open a shell in the Web container
shell-web:
	docker compose exec web sh

## Open a psql shell in the database container
shell-db:
	docker compose exec postgres psql -U $${POSTGRES_USER:-financas} -d $${POSTGRES_DB:-financas_familiar}

# ── Local development ────────────────────────────────────────────────────────

## Start all apps locally with hot reload (needs infra running)
dev:
	npm run dev

## Start only the API locally
dev-api:
	npm run dev:api

## Start only the Web locally
dev-web:
	npm run dev:web

## Lint all packages
lint:
	npm run lint

## Typecheck all packages
typecheck:
	npm run typecheck

## Run all tests
test:
	npm run test
