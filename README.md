# Família Finance

![PRD v1.1](https://img.shields.io/badge/PRD-v1.1-blue) ![Tech Spec v1.0](https://img.shields.io/badge/Tech%20Spec-v1.0-green) ![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)

## O problema

- Famílias não têm uma ferramenta única que permita visibilidade compartilhada das finanças sem perder privacidade individual
- Lançamentos manuais são trabalhosos e propensos a erro; importações via OFX/CSV são fragmentadas e sem contexto

## A solução

- **Controle familiar centralizado** — múltiplos membros com papéis distintos (ADMIN / MEMBER) sobre as mesmas contas e transações
- **Entrada inteligente** — registre gastos por texto livre, áudio ou foto de recibo; a IA preenche os campos automaticamente
- **Sincronização automática** — Open Finance traz extratos bancários diretamente para o fluxo de revisão e confirmação

## Stack

### Backend

| Tecnologia | Versão |
|-----------|--------|
| Node.js | 22 |
| Fastify | 5 |
| PostgreSQL | 16 |
| Prisma | 6 |
| Zod | 3 |
| BullMQ + Redis | 5 + 7 |
| JWT | @fastify/jwt |

### Frontend

| Tecnologia | Versão |
|-----------|--------|
| Next.js | 15 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| shadcn/ui | — |
| Zustand | 5 |
| TanStack Query | 5 |
| React Hook Form + Zod | 7 + 3 |
| Recharts | 2 |

## Infraestrutura

| Serviço | Dev | Produção |
|---------|-----|---------|
| Banco | Docker / PostgreSQL gerenciado | Supabase / Neon |
| Cache/Filas | Docker / Redis gerenciado | Upstash |
| Storage | MinIO | Cloudflare R2 |
| Email | Mailhog | Resend |
| LLM | Anthropic Claude API | Anthropic Claude API |
| Voz | OpenAI Whisper | OpenAI Whisper |

## Estrutura do projeto

```
financas-familiar/
├── apps/
│   ├── api/                          # Backend Fastify
│   │   ├── prisma/
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── app.ts                # Bootstrap da aplicação
│   │       ├── jobs/                 # Workers BullMQ
│   │       ├── lib/                  # Utilitários internos
│   │       ├── plugins/              # Plugins Fastify
│   │       └── modules/
│   │           ├── auth/             # Autenticação e convites
│   │           ├── family/           # Dados da família
│   │           ├── accounts/         # Contas bancárias
│   │           ├── transactions/     # Transações
│   │           ├── transfers/        # Transferências internas
│   │           ├── credit-cards/     # Cartões de crédito
│   │           ├── categories/       # Categorias
│   │           ├── drafts/           # Rascunhos
│   │           ├── reconciliation/   # Conciliação bancária
│   │           ├── goals/            # Metas financeiras
│   │           ├── budgets/          # Orçamentos
│   │           ├── reports/          # Relatórios
│   │           ├── ai-intake/        # Entrada via IA
│   │           └── open-finance/     # Integração Open Finance
│   └── web/                          # Frontend Next.js
│       └── src/
│           ├── app/
│           │   ├── auth/
│           │   │   ├── login/
│           │   │   └── cadastro/
│           │   └── app/
│           │       ├── dashboard/
│           │       ├── transacoes/
│           │       ├── contas/
│           │       ├── cartoes/
│           │       ├── transferencias/
│           │       ├── reconciliacao/
│           │       ├── metas/
│           │       ├── orcamentos/
│           │       └── relatorios/
│           ├── components/
│           │   ├── ui/
│           │   ├── forms/
│           │   ├── charts/
│           │   └── layout/
│           ├── hooks/
│           ├── lib/
│           └── stores/
├── packages/
│   ├── shared-types/                 # Tipos TypeScript compartilhados
│   └── ui/                           # Componentes compartilhados (futuro)
├── docker/
│   └── postgres/
│       └── init.sql
├── docs/
│   ├── PRD-financas-familiar.md
│   └── TECH-SPEC-financas-familiar.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── docker-compose.yml
├── turbo.json
└── package.json
```

## Como rodar em desenvolvimento

### Pré-requisitos

- Node.js >= 22
- npm >= 10
- Docker + Docker Compose

### Passo a passo

```bash
# 1. Clone e instale as dependências
git clone https://github.com/victormmelo/financas-familiar.git
cd financas-familiar
npm install

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com suas configurações locais

# 3. Suba os serviços de infraestrutura
npm run docker:up

# 4. Gere o cliente Prisma e execute as migrações
npm run db:generate
npm run db:migrate

# 5. Inicie o monorepo em modo dev
npm run dev
```

### URLs locais

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001 |
| Prisma Studio | http://localhost:5555 |
| MinIO Console | http://localhost:9001 |
| Mailhog | http://localhost:8025 |

## Módulos e funcionalidades

### v1

| Módulo | Status |
|--------|--------|
| Auth & Família (registro, login, convites) | 🔲 Planejado |
| Contas bancárias | 🔲 Planejado |
| Transações (draft → confirmado) | 🔲 Planejado |
| Transferências internas | 🔲 Planejado |
| Cartões de crédito e faturas | 🔲 Planejado |
| Categorias hierárquicas | 🔲 Planejado |
| Metas financeiras | 🔲 Planejado |
| Orçamentos mensais | 🔲 Planejado |

### v2 (roadmap)

- Investimentos
- Metas infantis (por filho)
- Push notifications
- Widget mobile
- Múltiplos espaços familiares
- Papel Observer (somente leitura)
- Integração com corretoras

## Regras de negócio fundamentais

| Código | Regra |
|--------|-------|
| RN-01 | Todos os dados pertencem a uma família (tenant isolado) |
| RN-02 | Novos membros entram apenas via convite do ADMIN (link expira em 48h) |
| RN-03 | Toda transação entra como DRAFT e precisa ser confirmada pelo usuário |
| RN-05 | Transferências internas geram dois lançamentos espelhados (débito + crédito) |
| RN-06 | Gastos no cartão não afetam saldo da conta até o pagamento da fatura |
| RN-09 | Metas têm valor alvo, data limite e progresso calculado em tempo real |
| RN-13 | A IA interpreta texto, áudio ou foto e retorna draft estruturado com intent classificado |

> Lista completa de regras de negócio em [docs/PRD-financas-familiar.md](docs/PRD-financas-familiar.md)

## Documentação

| Documento | Descrição |
|-----------|-----------|
| [PRD v1.1](docs/PRD-financas-familiar.md) | Requisitos de produto, regras de negócio e módulos |
| [Tech Spec v1.0](docs/TECH-SPEC-financas-familiar.md) | Arquitetura, stack, schema e convenções técnicas |
| Design System | Em desenvolvimento |

## Convenções

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

### Estrutura de módulo (API)

```
src/modules/{modulo}/
├── {modulo}.routes.ts   — definição de rotas Fastify
├── {modulo}.service.ts  — lógica de negócio
├── {modulo}.schema.ts   — schemas Zod para validação
└── {modulo}.types.ts    — tipos TypeScript do módulo
```

## Licença

Privado — todos os direitos reservados.
