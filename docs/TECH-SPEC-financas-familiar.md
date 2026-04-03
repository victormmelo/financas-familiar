# Tech Spec — Família Finance v1.0

## Arquitetura Geral

Monorepo gerenciado com **npm workspaces + Turborepo**.

```
financas-familiar/
├── apps/
│   ├── api/          # Fastify 5 + Prisma + PostgreSQL
│   └── web/          # Next.js 15 App Router
└── packages/
    ├── shared-types/ # Tipos TypeScript compartilhados
    └── ui/           # Componentes UI compartilhados (futuro)
```

## Stack

### Backend (apps/api)

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 22 |
| Framework | Fastify 5 |
| ORM | Prisma 6 |
| Banco | PostgreSQL 16 |
| Cache/Filas | Redis 7 + BullMQ 5 |
| Validação | Zod 3 |
| Auth | JWT (@fastify/jwt) + bcrypt |
| Storage | AWS SDK v3 (MinIO/R2 compatível) |
| Email | Nodemailer (dev: Mailhog, prod: Resend) |
| IA | Anthropic Claude API + OpenAI Whisper |
| Docs | @fastify/swagger + @fastify/swagger-ui |

### Frontend (apps/web)

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router) |
| Linguagem | TypeScript 5 |
| Estilo | Tailwind CSS 4 |
| Componentes | shadcn/ui |
| Estado global | Zustand 5 |
| Server state | TanStack Query 5 |
| Formulários | React Hook Form 7 + Zod 3 |
| Gráficos | Recharts 2 |
| Datas | date-fns 4 + date-fns-tz |

## Estrutura da API

### Convenções

- Rotas organizadas por módulo em `src/modules/{modulo}/`
- Cada módulo tem: `{modulo}.routes.ts`, `{modulo}.service.ts`, `{modulo}.schema.ts`, `{modulo}.types.ts`
- Plugins globais em `src/plugins/`
- Utilitários em `src/lib/`
- Workers BullMQ em `src/jobs/`

### Autenticação

```
POST /auth/register        — cria usuário + família
POST /auth/login           — retorna access + refresh token (cookie httpOnly)
POST /auth/refresh         — renova access token
POST /auth/invite          — ADMIN envia convite por e-mail
POST /auth/accept-invite/:token — aceita convite e cria conta
```

### Módulos e rotas principais

```
GET/POST   /family                    — dados da família
GET/POST   /accounts                  — contas bancárias
GET/POST   /transactions              — transações (draft → confirmed)
POST       /transactions/bulk-confirm — confirma múltiplos drafts
GET/POST   /transfers                 — transferências entre contas
GET/POST   /credit-cards             — cartões de crédito
GET        /credit-cards/:id/invoices — faturas
POST       /credit-cards/:id/pay     — pagar fatura
GET/POST   /categories               — categorias hierárquicas
GET/POST   /goals                    — metas financeiras
GET/POST   /budgets                  — orçamentos mensais
GET        /reports                  — relatórios (async)
POST       /ai-intake/text           — entrada via texto livre
POST       /ai-intake/voice          — entrada via áudio (Whisper)
POST       /ai-intake/receipt        — entrada via foto de recibo
GET        /open-finance/connect     — inicia conexão Open Finance
POST       /open-finance/webhook     — recebe eventos do provedor
```

## Schema do Banco de Dados

### Entidades principais

- **Family** — tenant raiz, tem members e todos os dados
- **User** — autenticação, pertence a uma família com um Role
- **FamilyInvite** — convites pendentes com token e expiração
- **Account** — conta bancária/investimento, pertence a família
- **Transaction** — lançamento financeiro com status draft/confirmed/deleted
- **TransactionDraft** — rascunho com fonte e dados brutos da IA
- **Transfer** — transferência interna entre contas (par de transactions)
- **CreditCard** — cartão de crédito com limite e dia de fechamento
- **CreditCardInvoice** — fatura mensal do cartão
- **Category** — categoria hierárquica por família
- **Goal** — meta financeira com progresso
- **Budget** — orçamento mensal por categoria
- **Report** — relatório gerado assincronamente

## Infraestrutura

### Desenvolvimento local (Docker)

| Serviço | Imagem | Porta |
|---------|--------|-------|
| PostgreSQL | postgres:16-alpine | 5432 |
| Redis | redis:7-alpine | 6379 |
| MinIO | minio/minio:latest | 9000 (API) / 9001 (Console) |
| Mailhog | mailhog/mailhog | 1025 (SMTP) / 8025 (UI) |

### Produção (recomendado)

| Serviço | Opção |
|---------|-------|
| PostgreSQL | Supabase / Neon / Railway |
| Redis | Upstash |
| Storage | Cloudflare R2 |
| Email | Resend |
| API | Railway / Fly.io / VPS |
| Frontend | Vercel |

## Filas (BullMQ)

- `recurring-transactions` — gera ocorrências de transações recorrentes
- `reports` — gera PDFs de relatórios assincronamente
- `open-finance-sync` — sincroniza transações do Open Finance
- `email` — envio de e-mails (convites, alertas de orçamento)

## Segurança

- Senhas: bcrypt com salt rounds 12
- Access token: JWT HS256, expira em 15min
- Refresh token: JWT HS256, expira em 7d, armazenado em httpOnly cookie
- Refresh rotation: novo refresh token a cada uso, token antigo invalidado
- CORS: origins configuráveis via env
- Rate limiting: @fastify/rate-limit (futuro)
- Helmet: @fastify/helmet (futuro)

## CI/CD

- GitHub Actions: lint + typecheck + test em cada push/PR para main e dev
- Serviços de teste: PostgreSQL 16 + Redis 7 via services do GitHub Actions
- Deploy: manual inicialmente, pipeline automatizado na v2

## Convenções de Código

### Commits (Conventional Commits)
```
feat: adiciona módulo de orçamentos
fix: corrige cálculo de saldo em transferências
chore: atualiza dependências
docs: adiciona documentação da API
test: adiciona testes do módulo de metas
```

### Branches
```
main    — produção
dev     — desenvolvimento integrado
feat/   — novas funcionalidades
fix/    — correções
chore/  — manutenção
```

### Estrutura de módulo
```
src/modules/{modulo}/
├── {modulo}.routes.ts   — definição de rotas Fastify
├── {modulo}.service.ts  — lógica de negócio
├── {modulo}.schema.ts   — schemas Zod para validação
└── {modulo}.types.ts    — tipos TypeScript do módulo
```
