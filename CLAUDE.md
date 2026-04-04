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
npm run dev          # inicia api + web em paralelo (Turborepo)
npm run build        # build de todos os apps
npm run lint         # lint em todo o monorepo
npm run typecheck    # typecheck em todo o monorepo
npm run docker:up    # sobe PostgreSQL, Redis, MinIO, Mailhog
npm run db:migrate   # roda migrações Prisma
npm run db:generate  # gera client Prisma
npm run db:studio    # abre Prisma Studio em :5555
```

## Regras globais
- TypeScript strict — nunca usar `any`
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`
- Branches: `main` (prod), `dev` (integração), `feat/`, `fix/`, `chore/`
- Tipos compartilhados SEMPRE em `packages/shared-types` — nunca duplicar
- Variáveis de ambiente nunca expostas em logs ou respostas de API

## Documentação de referência
- Arquitetura e stack completa: @docs/TECH-SPEC-financas-familiar.md
- Requisitos e regras de negócio: @docs/PRD-financas-familiar.md

## Skills disponíveis (consulte quando relevante)
- Trabalho no backend (módulos, rotas, serviços): @.claude/skills/backend-patterns/SKILL.md
- Trabalho no frontend (componentes, páginas, hooks): @.claude/skills/frontend-patterns/SKILL.md
- Comunicação frontend ↔ backend: @.claude/skills/api-contract/SKILL.md
- Design e UI: @.claude/skills/frontend-design/SKILL.md
