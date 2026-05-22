# Família Finance — Monorepo

Monorepo com **npm workspaces + Turborepo**.
Backend: Fastify 5 + Prisma 6 + PostgreSQL 16 + BullMQ + Redis
Frontend: Next.js 15 (App Router) + Tailwind 4 + shadcn/ui + TanStack Query 5

## Estrutura
- `apps/api/` — Backend Fastify
- `apps/web/` — Frontend Next.js
- `packages/shared-types/` — Tipos TypeScript compartilhados

## Comandos essenciais
```bash
npm run dev             # inicia api + web (+ mcp) no host (Turborepo)
npm run build           # build de todos os apps
npm run lint            # lint em todo o monorepo
npm run typecheck       # typecheck em todo o monorepo
npm run docker:up       # sobe só infra: PostgreSQL, Redis, MinIO, Mailhog, Keycloak (sem api/web/mcp no Compose)
npm run docker:up:all   # stack completa no Docker (api, web, mcp em imagem de produção; profile apps)
npm run db:migrate      # roda migrações Prisma
npm run db:generate     # gera client Prisma
npm run db:studio       # abre Prisma Studio em :5555

# Atalhos Make (equivalentes): make dev-infra, make dev-db, make dev, make up
```

## Regras globais
- TypeScript strict — nunca usar `any`
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`
- Branches: `main` (prod), `dev` (integração), `feat/`, `fix/`, `chore/`
- Tipos compartilhados SEMPRE em `packages/shared-types` — nunca duplicar
- Variáveis de ambiente nunca expostas em logs ou respostas de API
- Ao finalizar uma mudança no projeto, fazer commit com mensagem em Conventional Commits

## Documentação de referência
- Arquitetura e stack completa: @docs/TECH-SPEC-financas-familiar.md
- Requisitos e regras de negócio: @docs/PRD-financas-familiar.md

## Skills disponíveis (consulte quando relevante)
- Trabalho no backend (módulos, rotas, serviços): @.Codex/skills/backend-patterns/SKILL.md
- Trabalho no frontend (componentes, páginas, hooks): @.Codex/skills/frontend-patterns/SKILL.md
- Comunicação frontend ↔ backend: @.Codex/skills/api-contract/SKILL.md
- Design e UI: @.Codex/skills/frontend-design/SKILL.md
