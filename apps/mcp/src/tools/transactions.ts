import { parsePlainDate } from '@financas/shared-types'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'
import { withMcpToolOAuth } from '../mcp-scopes.js'

const createTransactionInput = z
  .object({
    accountId: z.string().uuid().optional(),
    type: z.enum(['INCOME', 'EXPENSE']),
    amount: z.number().positive(),
    description: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
    categoryId: z.string().uuid().optional(),
    notes: z.string().optional(),
    creditCardId: z.string().uuid().optional(),
    liquidated: z.boolean().optional(),
  })
  .refine((d) => d.creditCardId != null || d.accountId != null, {
    message: 'Informe accountId ou creditCardId',
    path: ['accountId'],
  })

const listTransactionsInput = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'DELETED']).optional(),
  liquidated: z.coerce.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  page: z.number().int().min(1).default(1),
})

const searchTransactionsInput = z.object({
  accountId: z.string().uuid().optional(),
  amountMin: z.number().positive().optional(),
  amountMax: z.number().positive().optional(),
  dateFrom: z.string(),
  dateTo: z.string(),
  description: z.string().optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'DELETED']).optional(),
})

const transactionToolDefinitionsBase = [
  {
    name: 'list_transactions',
    description:
      'Lista transações da família com filtros opcionais. Útil para consultar lançamentos, conferir extrato, revisar pendências.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        startDate: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        accountId: { type: 'string', description: 'ID da conta bancária' },
        categoryId: { type: 'string', description: 'ID da categoria' },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE'], description: 'Tipo: INCOME ou EXPENSE' },
        status: {
          type: 'string',
          enum: ['DRAFT', 'CONFIRMED', 'DELETED'],
          description: 'Status: DRAFT (rascunho), CONFIRMED (confirmado), DELETED (excluído)',
        },
        limit: { type: 'number', description: 'Máximo de resultados (padrão: 50)' },
        page: { type: 'number', description: 'Página (padrão: 1)' },
        liquidated: { type: 'boolean', description: 'Filtrar por liquidado (caixa)' },
      },
    },
  },
  {
    name: 'get_transaction',
    description: 'Busca detalhes de uma transação específica pelo ID.',
    inputSchema: {
      type: 'object' as const,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'ID da transação' },
      },
    },
  },
  {
    name: 'create_transaction',
    description:
      'Cria uma nova transação como DRAFT (rascunho). Use para registrar receitas ou despesas. O usuário pode confirmar depois.',
    inputSchema: {
      type: 'object' as const,
      required: ['type', 'amount', 'description', 'date'],
      properties: {
        accountId: {
          type: 'string',
          description: 'ID da conta bancária (opcional se creditCardId e o cartão tiver conta padrão)',
        },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE'], description: 'INCOME para receita, EXPENSE para despesa' },
        amount: { type: 'number', description: 'Valor positivo em reais' },
        description: { type: 'string', description: 'Descrição do lançamento' },
        date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        categoryId: { type: 'string', description: 'ID da categoria (opcional)' },
        notes: { type: 'string', description: 'Observações adicionais (opcional)' },
        creditCardId: { type: 'string', description: 'ID do cartão de crédito (se for gasto no cartão)' },
        liquidated: { type: 'boolean', description: 'Padrão false; true se já liquidou no caixa' },
      },
    },
  },
  {
    name: 'confirm_transaction',
    description: 'Confirma um rascunho (DRAFT), tornando-o um lançamento definitivo.',
    inputSchema: {
      type: 'object' as const,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'ID da transação a confirmar' },
      },
    },
  },
  {
    name: 'bulk_confirm_transactions',
    description: 'Confirma múltiplos rascunhos de uma vez.',
    inputSchema: {
      type: 'object' as const,
      required: ['ids'],
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Lista de IDs de transações a confirmar' },
      },
    },
  },
  {
    name: 'update_transaction',
    description: 'Atualiza campos de uma transação (funciona em DRAFT ou CONFIRMED).',
    inputSchema: {
      type: 'object' as const,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'ID da transação' },
        description: { type: 'string' },
        amount: { type: 'number', description: 'Novo valor positivo em reais' },
        date: { type: 'string', description: 'Nova data (YYYY-MM-DD)' },
        categoryId: { type: 'string', description: 'Novo ID de categoria' },
        notes: { type: 'string' },
        liquidated: { type: 'boolean' },
      },
    },
  },
  {
    name: 'delete_transaction',
    description: 'Exclui uma transação (soft delete — fica como DELETED).',
    inputSchema: {
      type: 'object' as const,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'ID da transação a excluir' },
      },
    },
  },
  {
    name: 'search_transactions',
    description:
      'Busca transações por critérios específicos — útil para reconciliação: verificar se um comprovante ou lançamento do extrato já existe.',
    inputSchema: {
      type: 'object' as const,
      required: ['dateFrom', 'dateTo'],
      properties: {
        dateFrom: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        dateTo: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        accountId: { type: 'string', description: 'Filtrar por conta' },
        amountMin: { type: 'number', description: 'Valor mínimo' },
        amountMax: { type: 'number', description: 'Valor máximo' },
        description: { type: 'string', description: 'Texto a buscar na descrição (busca parcial)' },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
        status: { type: 'string', enum: ['DRAFT', 'CONFIRMED', 'DELETED'] },
      },
    },
  },
  {
    name: 'bulk_create_transactions',
    description:
      'Cria múltiplas transações de uma vez como DRAFT. Ideal para lançar todas as transações faltantes após conferir um extrato.',
    inputSchema: {
      type: 'object' as const,
      required: ['transactions'],
      properties: {
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['accountId', 'type', 'amount', 'description', 'date'],
            properties: {
              accountId: { type: 'string' },
              type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
              amount: { type: 'number' },
              description: { type: 'string' },
              date: { type: 'string' },
              categoryId: { type: 'string' },
              notes: { type: 'string' },
              creditCardId: { type: 'string' },
              liquidated: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
]

export const transactionToolDefinitions = transactionToolDefinitionsBase.map((t) => withMcpToolOAuth(t))

export function registerTransactionHandlers(
  getContext: () => McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  toolHandlerMap.set('list_transactions', async (args) => {
    const { familyId } = getContext()
    const input = listTransactionsInput.parse(args)
    const { page, limit, accountId, categoryId, type, status, startDate, endDate, liquidated } = input
    const skip = (page - 1) * limit

    const where = {
      familyId,
      ...(accountId && { accountId }),
      ...(categoryId && { categoryId }),
      ...(type && { type }),
      ...(status ? { status } : { status: { not: 'DELETED' as const } }),
      ...(liquidated !== undefined && { liquidated }),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate && { gte: parsePlainDate(startDate) }),
              ...(endDate && { lte: parsePlainDate(endDate) }),
            },
          }
        : {}),
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          creditCard: { select: { id: true, name: true } },
          transfer: {
            select: {
              id: true,
              fromAccountId: true,
              toAccountId: true,
              fromAccount: { select: { id: true, name: true } },
              toAccount: { select: { id: true, name: true } },
            },
          },
          creditCardInvoice: {
            select: {
              id: true,
              referenceMonth: true,
              referenceYear: true,
              creditCard: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])

    return {
      transactions: transactions.map((t: (typeof transactions)[number]) => ({
        ...t,
        amount: Number(t.amount),
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    }
  })

  toolHandlerMap.set('get_transaction', async (args) => {
    const { familyId } = getContext()
    const { id } = z.object({ id: z.string() }).parse(args)
    const t = await prisma.transaction.findFirst({
      where: { id, familyId },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        creditCard: { select: { id: true, name: true } },
        transfer: {
          select: {
            id: true,
            fromAccountId: true,
            toAccountId: true,
            fromAccount: { select: { id: true, name: true } },
            toAccount: { select: { id: true, name: true } },
          },
        },
        creditCardInvoice: {
          select: {
            id: true,
            referenceMonth: true,
            referenceYear: true,
            creditCard: { select: { id: true, name: true } },
          },
        },
        draft: true,
      },
    })
    if (!t) throw new Error('Transação não encontrada')
    return { ...t, amount: Number(t.amount) }
  })

  toolHandlerMap.set('create_transaction', async (args) => {
    const { familyId, userId } = getContext()
    const input = createTransactionInput.parse(args)

    let resolvedAccountId = input.accountId
    if (input.creditCardId) {
      const card = await prisma.creditCard.findFirst({ where: { id: input.creditCardId, familyId } })
      if (!card) throw new Error('Cartão não encontrado')
      if (!resolvedAccountId) {
        if (!card.defaultAccountId) {
          throw new Error('Cartão sem conta padrão; informe accountId ou cadastre a conta no cartão.')
        }
        resolvedAccountId = card.defaultAccountId
      }
    }
    if (!resolvedAccountId) throw new Error('Conta obrigatória')

    const account = await prisma.account.findFirst({ where: { id: resolvedAccountId, familyId } })
    if (!account) throw new Error('Conta não encontrada')

    if (input.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: input.categoryId, familyId } })
      if (!cat) throw new Error('Categoria não encontrada')
    }

    const t = await prisma.transaction.create({
      data: {
        familyId,
        accountId: resolvedAccountId,
        categoryId: input.categoryId,
        createdById: userId,
        type: input.type,
        status: 'DRAFT',
        amount: input.amount,
        description: input.description,
        notes: input.notes,
        date: parsePlainDate(input.date),
        source: 'MANUAL',
        creditCardId: input.creditCardId,
        liquidated: input.liquidated ?? false,
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        creditCard: { select: { id: true, name: true } },
      },
    })
    return { ...t, amount: Number(t.amount) }
  })

  toolHandlerMap.set('confirm_transaction', async (args) => {
    const { familyId } = getContext()
    const { id } = z.object({ id: z.string() }).parse(args)
    const t = await prisma.transaction.findFirst({ where: { id, familyId } })
    if (!t) throw new Error('Transação não encontrada')
    if (t.status === 'CONFIRMED') throw new Error('Transação já confirmada')
    if (t.status === 'DELETED') throw new Error('Não é possível confirmar transação excluída')

    const updated = await prisma.transaction.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    })
    return { ...updated, amount: Number(updated.amount) }
  })

  toolHandlerMap.set('bulk_confirm_transactions', async (args) => {
    const { familyId } = getContext()
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(args)
    const { count } = await prisma.transaction.updateMany({
      where: { id: { in: ids }, familyId, status: 'DRAFT' },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    })
    return { confirmed: count, total: ids.length }
  })

  toolHandlerMap.set('update_transaction', async (args) => {
    const { familyId } = getContext()
    const input = z
      .object({
        id: z.string(),
        description: z.string().optional(),
        amount: z.number().positive().optional(),
        date: z.string().optional(),
        categoryId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        liquidated: z.boolean().optional(),
      })
      .parse(args)

    const { id, ...updates } = input
    const t = await prisma.transaction.findFirst({ where: { id, familyId } })
    if (!t) throw new Error('Transação não encontrada')
    if (t.status === 'DELETED') throw new Error('Não é possível editar transação excluída')

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.amount !== undefined && { amount: updates.amount }),
        ...(updates.date !== undefined && { date: parsePlainDate(updates.date) }),
        ...(updates.categoryId !== undefined && { categoryId: updates.categoryId }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.liquidated !== undefined && { liquidated: updates.liquidated }),
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    })
    return { ...updated, amount: Number(updated.amount) }
  })

  toolHandlerMap.set('delete_transaction', async (args) => {
    const { familyId } = getContext()
    const { id } = z.object({ id: z.string() }).parse(args)
    const t = await prisma.transaction.findFirst({ where: { id, familyId } })
    if (!t) throw new Error('Transação não encontrada')

    await prisma.transaction.update({ where: { id }, data: { status: 'DELETED' } })
    return { success: true, id }
  })

  toolHandlerMap.set('search_transactions', async (args) => {
    const { familyId } = getContext()
    const input = searchTransactionsInput.parse(args)

    const transactions = await prisma.transaction.findMany({
      where: {
        familyId,
        ...(input.accountId && { accountId: input.accountId }),
        ...(input.type && { type: input.type }),
        ...(input.status ? { status: input.status } : { status: { not: 'DELETED' as const } }),
        date: { gte: parsePlainDate(input.dateFrom), lte: parsePlainDate(input.dateTo) },
        ...(input.amountMin !== undefined || input.amountMax !== undefined
          ? {
              amount: {
                ...(input.amountMin !== undefined && { gte: input.amountMin }),
                ...(input.amountMax !== undefined && { lte: input.amountMax }),
              },
            }
          : {}),
        ...(input.description && {
          description: { contains: input.description, mode: 'insensitive' as const },
        }),
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { amount: 'desc' }],
      take: 100,
    })

    return {
      transactions: transactions.map((t: (typeof transactions)[number]) => ({ ...t, amount: Number(t.amount) })),
      count: transactions.length,
    }
  })

  toolHandlerMap.set('bulk_create_transactions', async (args) => {
    const { familyId, userId } = getContext()
    const { transactions } = z
      .object({ transactions: z.array(createTransactionInput) })
      .parse(args)

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const out: { id: string }[] = []
      for (const input of transactions) {
        let resolvedAccountId = input.accountId
        if (input.creditCardId) {
          const card = await tx.creditCard.findFirst({ where: { id: input.creditCardId, familyId } })
          if (!card) throw new Error('Cartão não encontrado')
          if (!resolvedAccountId) {
            if (!card.defaultAccountId) {
              throw new Error('Cartão sem conta padrão; informe accountId ou cadastre a conta no cartão.')
            }
            resolvedAccountId = card.defaultAccountId
          }
        }
        if (!resolvedAccountId) throw new Error('Conta obrigatória')
        const account = await tx.account.findFirst({ where: { id: resolvedAccountId, familyId } })
        if (!account) throw new Error('Conta não encontrada')
        const row = await tx.transaction.create({
          data: {
            familyId,
            accountId: resolvedAccountId,
            categoryId: input.categoryId,
            createdById: userId,
            type: input.type,
            status: 'DRAFT',
            amount: input.amount,
            description: input.description,
            notes: input.notes,
            date: parsePlainDate(input.date),
            source: 'MANUAL',
            creditCardId: input.creditCardId,
            liquidated: input.liquidated ?? false,
          },
        })
        out.push(row)
      }
      return out
    })

    return { created: created.length, ids: created.map((t: (typeof created)[number]) => t.id) }
  })
}
