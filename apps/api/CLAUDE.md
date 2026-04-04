# Backend — apps/api

Fastify 5 + Prisma 6 + PostgreSQL 16 + BullMQ 5 + Redis 7

## Comandos
```bash
npm run dev      # inicia api em :3001 com hot reload
npm run build    # compila TypeScript
npm run test     # roda testes
```

## Padrões de módulo

Cada módulo em `src/modules/{modulo}/` segue SEMPRE esta estrutura:
```
{modulo}.routes.ts   — registra rotas no Fastify (sem lógica)
{modulo}.service.ts  — toda lógica de negócio e acesso ao Prisma
{modulo}.schema.ts   — schemas Zod de request/response
{modulo}.types.ts    — tipos TypeScript do módulo
```

## Regras obrigatórias

**Autenticação**
- Access token JWT HS256 expira em 15min, via header Authorization Bearer
- Refresh token JWT HS256 expira em 7d, armazenado em httpOnly cookie
- Rotation obrigatória: cada uso do refresh gera novo par de tokens
- Sempre validar `familyId` do token contra o recurso acessado (multi-tenant)

**Multi-tenancy**
- Todo recurso pertence a uma Family — NUNCA retornar dados de outra família
- Sempre filtrar queries Prisma por `familyId` extraído do JWT
- Nunca confiar em `familyId` vindo do body da requisição

**Validação**
- Toda rota valida input com schema Zod via `preValidation`
- Erros de validação retornam 400 com detalhes dos campos
- Schemas de response também são tipados — nunca retornar campos sensíveis (senha, tokens)

**Transações financeiras**
- Toda transação nova entra como `status: DRAFT` (RN-03)
- Transferências internas geram dois lançamentos espelhados (RN-05)
- Gastos no cartão NÃO afetam saldo da conta até pagamento da fatura (RN-06)
- Nunca deletar — usar soft delete (`deletedAt`)

**Respostas**
- Sucesso: `{ data: T, meta?: PaginationMeta }`
- Erro: `{ error: { code: string, message: string, details?: unknown } }`
- Paginação: cursor-based com `{ data: T[], meta: { nextCursor, hasMore } }`

**Segurança**
- Senhas: bcrypt com salt rounds 12
- Nunca logar senhas, tokens ou dados pessoais
- Rate limiting em rotas de auth
- Helmet ativo em produção

## Consulte a skill completa de backend para:
- Criar um novo módulo do zero
- Padrões de worker BullMQ
- Integração com IA (ai-intake)
- Open Finance webhook handling
