import { parsePlainDate } from '@financas/shared-types'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'
import { withMcpToolOAuth } from '../mcp-scopes.js'

type DecimalLike = { toNumber(): number }

function decimalToNumber(value: DecimalLike | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

async function appendReimbursementMetrics<
  T extends {
    id: string
    amount: DecimalLike
    nature: string
    linkedTransaction?: { amount: DecimalLike } | null
  },
>(
  familyId: string,
  transactions: T[],
): Promise<Array<T & { reimbursedAmount: number; remainingReimbursableAmount: number; netAmount: number }>> {
  if (transactions.length === 0) return []
  const ids = transactions.map((tx) => tx.id)
  const reimbursements = (await prisma.transaction.groupBy({
    by: ['linkedTransactionId'],
    where: {
      familyId,
      nature: 'REIMBURSEMENT',
      status: { not: 'DELETED' },
      linkedTransactionId: { in: ids },
    },
    _sum: { amount: true },
  })) as Array<{ linkedTransactionId: string | null; _sum: { amount: DecimalLike | null } }>

  const reimbursedById = new Map(
    reimbursements
      .filter((row) => row.linkedTransactionId !== null)
      .map((row) => [row.linkedTransactionId as string, decimalToNumber(row._sum.amount)]),
  )

  return transactions.map((tx) => {
    const amount = decimalToNumber(tx.amount)
    const reimbursedAmount = reimbursedById.get(tx.id) ?? 0
    return {
      ...tx,
      reimbursedAmount,
      remainingReimbursableAmount: Math.max(amount - reimbursedAmount, 0),
      netAmount: tx.nature === 'REIMBURSEMENT' ? amount : amount - reimbursedAmount,
    }
  })
}

async function ensureNoLinkedTransactionCycle(
  familyId: string,
  currentTransactionId: string,
  linkedTransactionId: string,
) {
  const visited = new Set<string>()
  let cursor: string | null = linkedTransactionId

  while (cursor) {
    if (cursor === currentTransactionId) {
      throw new Error('Vínculo inválido: ciclo detectado entre transações')
    }
    if (visited.has(cursor)) break
    visited.add(cursor)

    const parent = (await prisma.transaction.findFirst({
      where: { id: cursor, familyId },
      select: { linkedTransactionId: true },
    })) as { linkedTransactionId: string | null } | null
    if (!parent) break
    cursor = parent.linkedTransactionId
  }
}

async function validateReimbursementLink(params: {
  familyId: string
  linkedTransactionId: string
  transactionType: 'INCOME' | 'EXPENSE'
  amount: number
  categoryId?: string | null
  currentTransactionId?: string
}) {
  const { familyId, linkedTransactionId, transactionType, amount, categoryId, currentTransactionId } = params

  const linkedTransaction = await prisma.transaction.findFirst({
    where: {
      id: linkedTransactionId,
      familyId,
      status: { not: 'DELETED' },
    },
    select: {
      id: true,
      type: true,
      nature: true,
      amount: true,
      categoryId: true,
    },
  })
  if (!linkedTransaction) throw new Error('Transação vinculada não encontrada')
  if (currentTransactionId && linkedTransaction.id === currentTransactionId) {
    throw new Error('Uma transação não pode ser vinculada a ela mesma')
  }
  if (linkedTransaction.nature === 'REIMBURSEMENT') {
    throw new Error('Reembolso deve apontar para a transação original, não para outro reembolso')
  }
  if (currentTransactionId) {
    await ensureNoLinkedTransactionCycle(familyId, currentTransactionId, linkedTransaction.id)
  }

  const expectedType = linkedTransaction.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE'
  if (transactionType !== expectedType) {
    throw new Error(`Tipo inválido para reembolso: esperado ${expectedType} para compensar ${linkedTransaction.type}`)
  }
  if (
    categoryId !== undefined &&
    categoryId !== null &&
    linkedTransaction.categoryId !== null &&
    categoryId !== linkedTransaction.categoryId
  ) {
    throw new Error('Categoria do reembolso deve ser igual à categoria da transação original')
  }

  const reimbursedAgg = await prisma.transaction.aggregate({
    where: {
      familyId,
      nature: 'REIMBURSEMENT',
      linkedTransactionId: linkedTransaction.id,
      status: { not: 'DELETED' },
      ...(currentTransactionId ? { id: { not: currentTransactionId } } : {}),
    },
    _sum: { amount: true },
  })
  const reimbursedAmount = decimalToNumber(reimbursedAgg._sum.amount)
  const originalAmount = decimalToNumber(linkedTransaction.amount)
  if (reimbursedAmount + amount > originalAmount) {
    throw new Error('Soma dos reembolsos não pode ultrapassar o valor da transação original')
  }

  return {
    linkedTransaction,
    resolvedCategoryId: categoryId ?? linkedTransaction.categoryId ?? null,
    reimbursedAmount,
    remainingReimbursableAmount: Math.max(originalAmount - reimbursedAmount, 0),
  }
}

const createTransactionInput = z
  .object({
    accountId: z.string().uuid().optional(),
    type: z.enum(['INCOME', 'EXPENSE']),
    nature: z.enum(['NORMAL', 'REIMBURSEMENT', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL']).default('NORMAL'),
    linkedTransactionId: z.string().uuid().optional(),
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
  nature: z.enum(['NORMAL', 'REIMBURSEMENT', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL']).optional(),
  linkedTransactionId: z.string().uuid().optional(),
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
        nature: {
          type: 'string',
          enum: ['NORMAL', 'REIMBURSEMENT', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL'],
          description: 'Natureza gerencial da transação',
        },
        linkedTransactionId: {
          type: 'string',
          description: 'Filtra por ID da transação original vinculada (reembolsos)',
        },
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
        nature: {
          type: 'string',
          enum: ['NORMAL', 'REIMBURSEMENT', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL'],
          description: 'Natureza gerencial (padrão: NORMAL)',
        },
        linkedTransactionId: {
          type: 'string',
          description: 'Obrigatório em nature=REIMBURSEMENT (transação original)',
        },
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
    name: 'get_reimbursement_context',
    description:
      'Retorna contexto de reembolso de uma transação original: valor original, total já reembolsado, saldo reembolsável e sugestão de tipo/categoria.',
    inputSchema: {
      type: 'object' as const,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'ID da transação original' },
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
        nature: {
          type: 'string',
          enum: ['NORMAL', 'REIMBURSEMENT', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL'],
          description: 'Nova natureza gerencial',
        },
        linkedTransactionId: { type: 'string', description: 'Vínculo da transação original para reembolso' },
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
              nature: { type: 'string', enum: ['NORMAL', 'REIMBURSEMENT', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL'] },
              linkedTransactionId: { type: 'string' },
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
    const {
      page,
      limit,
      accountId,
      categoryId,
      type,
      nature,
      linkedTransactionId,
      status,
      startDate,
      endDate,
      liquidated,
    } = input
    const skip = (page - 1) * limit

    const where = {
      familyId,
      ...(accountId && { accountId }),
      ...(categoryId && { categoryId }),
      ...(type && { type }),
      ...(nature && { nature }),
      ...(linkedTransactionId && { linkedTransactionId }),
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
          linkedTransaction: {
            select: {
              id: true,
              type: true,
              nature: true,
              status: true,
              amount: true,
              categoryId: true,
              description: true,
              category: { select: { id: true, name: true, type: true } },
            },
          },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])

    const withMetrics = await appendReimbursementMetrics(familyId, transactions)

    return {
      transactions: withMetrics.map((t: (typeof withMetrics)[number]) => ({
        ...t,
        amount: decimalToNumber(t.amount),
        linkedTransaction: t.linkedTransaction
          ? { ...t.linkedTransaction, amount: decimalToNumber(t.linkedTransaction.amount) }
          : null,
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
        linkedTransaction: {
          select: {
            id: true,
            type: true,
            nature: true,
            status: true,
            amount: true,
            categoryId: true,
            description: true,
            category: { select: { id: true, name: true, type: true } },
          },
        },
      },
    })
    if (!t) throw new Error('Transação não encontrada')
    const [withMetrics] = await appendReimbursementMetrics(familyId, [t])
    return {
      ...withMetrics,
      amount: decimalToNumber(withMetrics.amount),
      linkedTransaction: withMetrics.linkedTransaction
        ? {
            ...withMetrics.linkedTransaction,
            amount: decimalToNumber(withMetrics.linkedTransaction.amount),
          }
        : null,
    }
  })

  toolHandlerMap.set('get_reimbursement_context', async (args) => {
    const { familyId } = getContext()
    const { id } = z.object({ id: z.string().uuid() }).parse(args)

    const transaction = await prisma.transaction.findFirst({
      where: { id, familyId, status: { not: 'DELETED' } },
      include: {
        category: { select: { id: true, name: true, type: true } },
        account: { select: { id: true, name: true } },
      },
    })
    if (!transaction) throw new Error('Transação original não encontrada')
    if (transaction.nature === 'REIMBURSEMENT') {
      throw new Error('Selecione uma transação original (nature=NORMAL), não um reembolso')
    }

    const reimbursements = await prisma.transaction.findMany({
      where: {
        familyId,
        nature: 'REIMBURSEMENT',
        linkedTransactionId: transaction.id,
        status: { not: 'DELETED' },
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    })

    const reimbursedAmount = reimbursements.reduce(
      (sum: number, tx: (typeof reimbursements)[number]) => sum + decimalToNumber(tx.amount),
      0,
    )
    const originalAmount = decimalToNumber(transaction.amount)

    return {
      transaction: {
        ...transaction,
        amount: originalAmount,
        reimbursedAmount,
        remainingReimbursableAmount: Math.max(originalAmount - reimbursedAmount, 0),
        netAmount: originalAmount - reimbursedAmount,
      },
      reimbursements: reimbursements.map((tx: (typeof reimbursements)[number]) => ({
        ...tx,
        amount: decimalToNumber(tx.amount),
        reimbursedAmount: 0,
        remainingReimbursableAmount: 0,
        netAmount: decimalToNumber(tx.amount),
      })),
      suggested: {
        type: transaction.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE',
        categoryId: transaction.categoryId,
      },
    }
  })

  toolHandlerMap.set('create_transaction', async (args) => {
    const { familyId, userId } = getContext()
    const input = createTransactionInput.parse(args)

    const nature = input.nature ?? 'NORMAL'
    let resolvedAccountId = input.accountId
    let resolvedCategoryId: string | null = input.categoryId ?? null
    let resolvedLinkedTransactionId: string | null = null

    if (nature === 'REIMBURSEMENT') {
      if (!input.linkedTransactionId) {
        throw new Error('linkedTransactionId é obrigatório para reembolso')
      }
      const reimbursementValidation = await validateReimbursementLink({
        familyId,
        linkedTransactionId: input.linkedTransactionId,
        transactionType: input.type,
        amount: input.amount,
        categoryId: resolvedCategoryId,
      })
      resolvedLinkedTransactionId = reimbursementValidation.linkedTransaction.id
      resolvedCategoryId = reimbursementValidation.resolvedCategoryId
    } else if (input.linkedTransactionId) {
      throw new Error('linkedTransactionId só pode ser usado com nature=REIMBURSEMENT')
    }

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

    if (resolvedCategoryId) {
      const cat = await prisma.category.findFirst({ where: { id: resolvedCategoryId, familyId } })
      if (!cat) throw new Error('Categoria não encontrada')
    }

    const t = await prisma.transaction.create({
      data: {
        familyId,
        accountId: resolvedAccountId,
        categoryId: resolvedCategoryId,
        createdById: userId,
        type: input.type,
        nature,
        linkedTransactionId: resolvedLinkedTransactionId,
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
        linkedTransaction: {
          select: {
            id: true,
            type: true,
            nature: true,
            status: true,
            amount: true,
            categoryId: true,
            description: true,
            category: { select: { id: true, name: true, type: true } },
          },
        },
      },
    })
    const [withMetrics] = await appendReimbursementMetrics(familyId, [t])
    return {
      ...withMetrics,
      amount: decimalToNumber(withMetrics.amount),
      linkedTransaction: withMetrics.linkedTransaction
        ? { ...withMetrics.linkedTransaction, amount: decimalToNumber(withMetrics.linkedTransaction.amount) }
        : null,
    }
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
        nature: z.enum(['NORMAL', 'REIMBURSEMENT', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL']).optional(),
        linkedTransactionId: z.string().uuid().nullable().optional(),
        notes: z.string().nullable().optional(),
        liquidated: z.boolean().optional(),
      })
      .parse(args)

    const { id, ...updates } = input
    const t = await prisma.transaction.findFirst({
      where: { id, familyId },
      include: { linkedTransaction: { select: { id: true } } },
    })
    if (!t) throw new Error('Transação não encontrada')
    if (t.status === 'DELETED') throw new Error('Não é possível editar transação excluída')

    const nextNature = updates.nature ?? t.nature
    const nextAmount = updates.amount ?? decimalToNumber(t.amount)
    const providedLinkedTransactionId =
      updates.linkedTransactionId === null
        ? null
        : updates.linkedTransactionId !== undefined
          ? updates.linkedTransactionId
          : t.linkedTransactionId
    let resolvedLinkedTransactionId: string | null = providedLinkedTransactionId
    let resolvedCategoryId = updates.categoryId !== undefined ? updates.categoryId : t.categoryId

    if (resolvedCategoryId) {
      const category = await prisma.category.findFirst({ where: { id: resolvedCategoryId, familyId } })
      if (!category) throw new Error('Categoria não encontrada')
    }

    if (nextNature === 'REIMBURSEMENT') {
      if (!resolvedLinkedTransactionId) {
        throw new Error('linkedTransactionId é obrigatório para reembolso')
      }
      const reimbursementValidation = await validateReimbursementLink({
        familyId,
        linkedTransactionId: resolvedLinkedTransactionId,
        transactionType: t.type,
        amount: nextAmount,
        categoryId: resolvedCategoryId,
        currentTransactionId: t.id,
      })
      resolvedLinkedTransactionId = reimbursementValidation.linkedTransaction.id
      resolvedCategoryId = reimbursementValidation.resolvedCategoryId
    } else if (updates.linkedTransactionId !== undefined || updates.nature !== undefined) {
      resolvedLinkedTransactionId = null
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.amount !== undefined && { amount: updates.amount }),
        ...(updates.date !== undefined && { date: parsePlainDate(updates.date) }),
        ...(updates.categoryId !== undefined || nextNature === 'REIMBURSEMENT'
          ? { categoryId: resolvedCategoryId }
          : {}),
        ...(updates.nature !== undefined ? { nature: nextNature } : {}),
        ...(updates.linkedTransactionId !== undefined || updates.nature !== undefined
          ? { linkedTransactionId: resolvedLinkedTransactionId }
          : {}),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.liquidated !== undefined && { liquidated: updates.liquidated }),
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        linkedTransaction: {
          select: {
            id: true,
            type: true,
            nature: true,
            status: true,
            amount: true,
            categoryId: true,
            description: true,
            category: { select: { id: true, name: true, type: true } },
          },
        },
      },
    })
    const [withMetrics] = await appendReimbursementMetrics(familyId, [updated])
    return {
      ...withMetrics,
      amount: decimalToNumber(withMetrics.amount),
      linkedTransaction: withMetrics.linkedTransaction
        ? { ...withMetrics.linkedTransaction, amount: decimalToNumber(withMetrics.linkedTransaction.amount) }
        : null,
    }
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
        const nature = input.nature ?? 'NORMAL'
        let resolvedCategoryId: string | null = input.categoryId ?? null
        let resolvedLinkedTransactionId: string | null = null
        let resolvedAccountId = input.accountId

        if (nature === 'REIMBURSEMENT') {
          if (!input.linkedTransactionId) {
            throw new Error('linkedTransactionId é obrigatório para reembolso')
          }
          const reimbursementValidation = await validateReimbursementLink({
            familyId,
            linkedTransactionId: input.linkedTransactionId,
            transactionType: input.type,
            amount: input.amount,
            categoryId: resolvedCategoryId,
          })
          resolvedLinkedTransactionId = reimbursementValidation.linkedTransaction.id
          resolvedCategoryId = reimbursementValidation.resolvedCategoryId
        } else if (input.linkedTransactionId) {
          throw new Error('linkedTransactionId só pode ser usado com nature=REIMBURSEMENT')
        }

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
        if (resolvedCategoryId) {
          const cat = await tx.category.findFirst({ where: { id: resolvedCategoryId, familyId } })
          if (!cat) throw new Error('Categoria não encontrada')
        }
        const row = await tx.transaction.create({
          data: {
            familyId,
            accountId: resolvedAccountId,
            categoryId: resolvedCategoryId,
            createdById: userId,
            type: input.type,
            nature,
            linkedTransactionId: resolvedLinkedTransactionId,
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

    return { created: created.length, ids: created.map((tx: (typeof created)[number]) => tx.id) }
  })
}
