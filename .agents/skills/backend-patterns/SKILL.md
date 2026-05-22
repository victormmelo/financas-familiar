---
name: backend-patterns
description: Usar ao criar ou editar módulos, rotas, services, schemas ou workers no backend Fastify
---

# Backend Patterns — Família Finance

## Criando um novo módulo

### 1. Estrutura de arquivos
```
src/modules/exemplo/
├── exemplo.routes.ts
├── exemplo.service.ts
├── exemplo.schema.ts
└── exemplo.types.ts
```

### 2. Schema (exemplo.schema.ts)
```typescript
import { z } from 'zod'

export const createExemploSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    amount: z.number().positive(),
  }),
})

export const listExemploSchema = z.object({
  querystring: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
})

// Response schema — nunca incluir campos sensíveis
export const exemploResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number(),
  createdAt: z.string(),
})
```

### 3. Service (exemplo.service.ts)
```typescript
import { prisma } from '../../lib/prisma'
import type { CreateExemploInput } from './exemplo.types'

export async function createExemplo(familyId: string, data: CreateExemploInput) {
  return prisma.exemplo.create({
    data: { ...data, familyId },
  })
}

export async function listExemplos(familyId: string, cursor?: string, limit = 20) {
  const items = await prisma.exemplo.findMany({
    where: { familyId, deletedAt: null },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  })

  const hasMore = items.length > limit
  return {
    data: hasMore ? items.slice(0, -1) : items,
    meta: { nextCursor: hasMore ? items[limit - 1].id : null, hasMore },
  }
}
```

### 4. Routes (exemplo.routes.ts)
```typescript
import type { FastifyInstance } from 'fastify'
import { createExemplo, listExemplos } from './exemplo.service'
import { createExemploSchema, listExemploSchema } from './exemplo.schema'

export async function exemploRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate) // JWT obrigatório

  app.post('/', { schema: { body: createExemploSchema.shape.body } }, async (req, reply) => {
    const { familyId } = req.user // extraído do JWT — nunca do body
    const result = await createExemplo(familyId, req.body)
    return reply.status(201).send({ data: result })
  })

  app.get('/', { schema: { querystring: listExemploSchema.shape.querystring } }, async (req) => {
    const { familyId } = req.user
    return listExemplos(familyId, req.query.cursor, req.query.limit)
  })
}
```

## Padrão de resposta da API
```typescript
// Sucesso simples
reply.send({ data: result })

// Sucesso com paginação
reply.send({ data: items, meta: { nextCursor, hasMore } })

// Erro
reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: '...' } })
reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado' } })
reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Sem permissão' } })
```

## Regras de segurança multi-tenant
```typescript
// ✅ CORRETO — familyId sempre do JWT
const { familyId, userId } = req.user

// ❌ NUNCA confiar no body
const familyId = req.body.familyId // PROIBIDO

// ✅ Sempre filtrar por familyId no Prisma
const account = await prisma.account.findFirst({
  where: { id: req.params.id, familyId }, // ambos obrigatórios
})
if (!account) return reply.status(404).send(...)
```

## Worker BullMQ
```typescript
// src/jobs/exemplo.worker.ts
import { Worker } from 'bullmq'
import { redis } from '../lib/redis'

export const exemploWorker = new Worker(
  'exemplo-queue',
  async (job) => {
    // lógica do job
  },
  { connection: redis, concurrency: 5 }
)
```
