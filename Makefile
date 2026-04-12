.PHONY: up down build rebuild logs restart reset \
        infra dev-infra dev-db dev dev-down docker-all \
        migrate migrate-prod studio seed \
        shell-api shell-web shell-db \
        dev-api dev-web lint typecheck test

# ── Docker ───────────────────────────────────────────────────────────────────

## Stack completa no Docker (api + web + mcp em imagem de produção)
up: docker-all

docker-all:
	docker compose --profile apps up -d

## Infra local: PostgreSQL, Redis, MinIO, Mailhog, Keycloak (sem api/web/mcp)
infra:
	docker compose up -d

dev-infra: infra

## Stop all services
down:
	docker compose down

dev-down: down

## Build (or rebuild) all Docker images (inclui serviços com profile apps)
build:
	docker compose --profile apps build

## Rebuild images without cache
rebuild:
	docker compose --profile apps build --no-cache

## Follow logs (optionally filter: make logs s=api)
logs:
	docker compose logs -f $(s)

## Restart a service: make restart s=api (exige containers com profile apps ativos)
restart:
	docker compose restart $(s)

## Remove containers and volumes (full data reset)
reset:
	docker compose down -v

# ── Database ─────────────────────────────────────────────────────────────────

## Gera Prisma client e aplica migrações (host; use após clone ou mudança de schema)
dev-db:
	npm run db:generate && npm run db:migrate

## Run migrations in development mode
migrate:
	npm run db:migrate

## Deploy migrations (production; exige API no Docker: make up)
migrate-prod:
	docker compose exec api npx prisma migrate deploy

## Open Prisma Studio
studio:
	npm run db:studio

## Seed the database
seed:
	npm run db:seed --workspace=apps/api

# ── Shells ───────────────────────────────────────────────────────────────────

## Open a shell in the API container (make up antes)
shell-api:
	docker compose exec api sh

## Open a shell in the Web container (make up antes)
shell-web:
	docker compose exec web sh

## Open a psql shell in the database container
shell-db:
	docker compose exec postgres psql -U $${POSTGRES_USER:-financas} -d $${POSTGRES_DB:-financas_familiar}

# ── Local development ────────────────────────────────────────────────────────

## Sobe a infra no Docker e roda api+web (+mcp via Turbo) no host com npm run dev
dev: dev-infra
	npm run dev

## Start only the API locally (precisa de infra)
dev-api:
	npm run dev:api

## Start only the Web locally (precisa de infra)
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
