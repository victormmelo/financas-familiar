import { parsePlainDate, wireTransactionDate } from '@financas/shared-types'
import { prisma } from '../../lib/prisma.js'
import { randomUUID } from 'crypto'
import { RRule } from 'rrule'
import type { Prisma } from '@prisma/client'
import { generateOccurrences } from '../../jobs/recurring-transactions.worker.js'
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  DeleteTransactionInput,
  BulkConfirmInput,
  BulkSetCategoryInput,
  ListTransactionsInput,
} from './transactions.schema.js'
import {
  reconcileInvoiceStatesForCard,
  ensureInvoiceRowsForCreditCardFromActivity,
} from '../../lib/credit-card-invoices-sync.js'
import { dueInvoiceKeyForPurchaseDate } from '@financas/shared-types'
import { canEditFinancialForInvoice } from '../credit-cards/invoice-lifecycle.js'
import { createInvoiceEvent } from '../credit-cards/credit-cards.service.js'

const ALLOW_REIMBURSEMENT_OVERFLOW = process.env.ALLOW_REIMBURSEMENT_OVERFLOW === 'true'

type DecimalLike = { toNumber(): number }

function statusForNewTransaction(confirmed: boolean | undefined) {
  return confirmed
    ? ({ status: 'CONFIRMED' as const, confirmedAt: new Date() })
    : ({ status: 'DRAFT' as const, confirmedAt: null })
}

/** Transações só podem usar categoria folha (sem subcategorias). */
function assertCategoryIsLeafForTransaction(
  category: { _count: { subcategories: number } },
): void {
  if (category._count.subcategories > 0) {
    throw Object.assign(
      new Error('Categorias agrupadoras não recebem lançamento. Use uma subcategoria.'),
      { statusCode: 422 },
    )
  }
}

function decimalToNumber(value: DecimalLike | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

type TransactionWithReimbursementMetrics = {
  reimbursedAmount: number
  remainingReimbursableAmount: number
  netAmount: number
}

async function appendReimbursementMetrics<
  T extends {
    id: string
    amount: DecimalLike
    nature: string
    linkedTransaction?: { amount: DecimalLike } | null
    rrule?: string | null
  },
>(
  familyId: string,
  transactions: T[],
): Promise<Array<T & TransactionWithReimbursementMetrics>> {
  if (transactions.length === 0) return []

  const ids = transactions.map((tx) => tx.id)
  const reimbursementRows = await prisma.transaction.findMany({
    where: {
      familyId,
      nature: 'REIMBURSEMENT',
      status: { not: 'DELETED' },
      linkedTransactionId: { in: ids },
    },
    select: { linkedTransactionId: true, amount: true },
  })

  const reimbursedById = new Map<string, number>()
  for (const row of reimbursementRows) {
    const lid = row.linkedTransactionId
    if (lid === null) continue
    reimbursedById.set(lid, (reimbursedById.get(lid) ?? 0) + decimalToNumber(row.amount))
  }

  return transactions.map((tx) => {
    const amount = decimalToNumber(tx.amount)
    const reimbursedAmount = reimbursedById.get(tx.id) ?? 0
    const remainingReimbursableAmount = Math.max(amount - reimbursedAmount, 0)
    const netAmount = tx.nature === 'REIMBURSEMENT' ? amount : amount - reimbursedAmount

    return {
      ...tx,
      reimbursedAmount,
      remainingReimbursableAmount,
      netAmount,
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
      throw Object.assign(new Error('Vínculo inválido: ciclo detectado entre transações'), { statusCode: 400 })
    }
    if (visited.has(cursor)) {
      break
    }
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
  reimbursementOverflowReason?: string
}) {
  const {
    familyId,
    linkedTransactionId,
    transactionType,
    amount,
    categoryId,
    currentTransactionId,
    reimbursementOverflowReason,
  } = params

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
      linkedTransactionId: true,
    },
  })

  if (!linkedTransaction) {
    throw Object.assign(new Error('Transação vinculada não encontrada'), { statusCode: 404 })
  }
  if (currentTransactionId && linkedTransaction.id === currentTransactionId) {
    throw Object.assign(new Error('Uma transação não pode ser vinculada a ela mesma'), {
      statusCode: 400,
    })
  }
  if (linkedTransaction.nature === 'REIMBURSEMENT') {
    throw Object.assign(new Error('Reembolso deve apontar para a transação original, não para outro reembolso'), {
      statusCode: 400,
    })
  }
  if (currentTransactionId) {
    await ensureNoLinkedTransactionCycle(familyId, currentTransactionId, linkedTransaction.id)
  }

  const expectedType = linkedTransaction.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE'
  if (transactionType !== expectedType) {
    throw Object.assign(
      new Error(`Tipo inválido para reembolso: esperado ${expectedType} para compensar ${linkedTransaction.type}`),
      { statusCode: 400 },
    )
  }

  if (
    categoryId !== undefined &&
    categoryId !== null &&
    linkedTransaction.categoryId !== null &&
    categoryId !== linkedTransaction.categoryId
  ) {
    throw Object.assign(
      new Error('Categoria do reembolso deve ser igual à categoria da transação original'),
      { statusCode: 400 },
    )
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
  const totalAfter = reimbursedAmount + amount
  const wouldOverflow = totalAfter > originalAmount

  if (wouldOverflow) {
    const canOverflow = ALLOW_REIMBURSEMENT_OVERFLOW && !!reimbursementOverflowReason
    if (!canOverflow) {
      throw Object.assign(
        new Error('Soma dos reembolsos não pode ultrapassar o valor da transação original'),
        { statusCode: 409 },
      )
    }
  }

  return {
    linkedTransaction,
    reimbursedAmount,
    remainingReimbursableAmount: Math.max(originalAmount - reimbursedAmount, 0),
    resolvedCategoryId: categoryId ?? linkedTransaction.categoryId ?? null,
  }
}

/** Resolve `accountId` a partir do payload (conta explícita ou padrão do cartão). */
async function resolveTransactionAccountId(
  familyId: string,
  accountId: string | undefined,
  creditCardId: string | undefined,
): Promise<string> {
  let resolved = accountId
  if (creditCardId) {
    const card = await prisma.creditCard.findFirst({
      where: { id: creditCardId, familyId },
    })
    if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })
    if (!resolved) {
      if (!card.defaultAccountId) {
        throw Object.assign(
          new Error('Cartão sem conta padrão. Configure a conta no cadastro do cartão ou informe a conta.'),
          { statusCode: 400 },
        )
      }
      resolved = card.defaultAccountId
    }
  }
  if (!resolved) {
    throw Object.assign(new Error('Conta obrigatória'), { statusCode: 400 })
  }
  const account = await prisma.account.findFirst({ where: { id: resolved, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })
  return resolved
}

/** Resolve `creditCardInvoiceId` pela data da compra e pelo ciclo de vencimento do cartão. */
async function resolveCreditCardInvoiceIdForPurchaseDate(
  familyId: string,
  creditCardId: string,
  date: Date,
): Promise<string | null> {
  const card = await prisma.creditCard.findFirst({
    where: { id: creditCardId, familyId },
    select: { id: true, closingDay: true, dueDay: true },
  })
  if (!card) return null

  await ensureInvoiceRowsForCreditCardFromActivity(card.id, card.closingDay, card.dueDay)

  try {
    const key = dueInvoiceKeyForPurchaseDate(date, card.closingDay, card.dueDay)
    const inv = await prisma.creditCardInvoice.findFirst({
      where: {
        creditCardId: card.id,
        referenceMonth: key.referenceMonth,
        referenceYear: key.referenceYear,
      },
      select: { id: true },
    })
    return inv?.id ?? null
  } catch {
    return null
  }
}

async function resolveInvoiceContextForTransaction(params: {
  familyId: string
  creditCardId: string
  creditCardInvoiceId: string | null
  date: Date
}) {
  const { familyId, creditCardId, creditCardInvoiceId, date } = params

  const card = await prisma.creditCard.findFirst({
    where: { id: creditCardId, familyId },
    select: { id: true, closingDay: true, dueDay: true },
  })
  if (!card) return null

  await ensureInvoiceRowsForCreditCardFromActivity(card.id, card.closingDay, card.dueDay)

  let invoice =
    creditCardInvoiceId !== null && creditCardInvoiceId !== ''
      ? await prisma.creditCardInvoice.findFirst({
          where: { id: creditCardInvoiceId, creditCardId },
        })
      : null

  if (!invoice) {
    try {
      const key = dueInvoiceKeyForPurchaseDate(date, card.closingDay, card.dueDay)
      invoice = await prisma.creditCardInvoice.findFirst({
        where: {
          creditCardId,
          referenceMonth: key.referenceMonth,
          referenceYear: key.referenceYear,
        },
      })
    } catch {
      invoice = null
    }
  }

  if (!invoice) return null

  return { card, invoice }
}

async function assertCardTransactionIsMutable(params: {
  familyId: string
  transaction: {
    id: string
    creditCardId: string | null
    creditCardInvoiceId: string | null
    date: Date
    description: string
  }
  changeReason?: string
}) {
  const { familyId, transaction, changeReason } = params
  if (!transaction.creditCardId) return null

  const invoiceContext = await resolveInvoiceContextForTransaction({
    familyId,
    creditCardId: transaction.creditCardId,
    creditCardInvoiceId: transaction.creditCardInvoiceId,
    date: transaction.date,
  })
  if (!invoiceContext) return null

  const { invoice, card } = invoiceContext
  const requiresReason = invoice.status === 'CLOSED' || invoice.status === 'RENEGOTIATED'
  if (requiresReason && !changeReason) {
    throw Object.assign(new Error('Motivo é obrigatório para alterar transações em fatura fechada/renegociada'), {
      statusCode: 400,
    })
  }
  if (!canEditFinancialForInvoice(invoice.status)) {
    throw Object.assign(
      new Error('Fatura fechada/renegociada: reabra a fatura para alterar transações financeiras'),
      { statusCode: 409 },
    )
  }

  return { invoice, card }
}

export async function listTransactions(familyId: string, query: ListTransactionsInput) {
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
    isRecurring,
    liquidated,
  } = query
  const skip = (page - 1) * limit

  const statusWhere =
    status === undefined
      ? { status: { not: 'DELETED' as const } }
      : { status }

  const where = {
    familyId,
    ...(accountId && { accountId }),
    ...(categoryId && { categoryId }),
    ...(type && { type }),
    ...(nature && { nature }),
    ...(linkedTransactionId && { linkedTransactionId }),
    ...statusWhere,
    ...(isRecurring !== undefined && { isRecurring }),
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
        category: { select: { id: true, name: true, type: true } },
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

  const data = await appendReimbursementMetrics(familyId, transactions)

  return {
    data: data.map(wireTransactionDate),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
}

export async function getTransaction(familyId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
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
      draft: true,
    },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })
  const [withMetrics] = await appendReimbursementMetrics(familyId, [transaction])
  return wireTransactionDate(withMetrics)
}

export async function getReimbursementContext(familyId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      familyId,
      status: { not: 'DELETED' },
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
      account: { select: { id: true, name: true } },
    },
  })
  if (!transaction) throw Object.assign(new Error('Transação original não encontrada'), { statusCode: 404 })

  if (transaction.nature === 'REIMBURSEMENT') {
    throw Object.assign(
      new Error('Selecione uma transação original (nature=NORMAL), não um reembolso'),
      { statusCode: 400 },
    )
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
    (sum: number, tx: { amount: DecimalLike }) => sum + decimalToNumber(tx.amount),
    0,
  )
  const originalAmount = decimalToNumber(transaction.amount)
  const remainingReimbursableAmount = Math.max(originalAmount - reimbursedAmount, 0)
  const suggestedReimbursementType = transaction.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE'

  return {
    transaction: wireTransactionDate({
      ...transaction,
      reimbursedAmount,
      remainingReimbursableAmount,
      netAmount: originalAmount - reimbursedAmount,
    }),
    reimbursements: reimbursements.map((tx: (typeof reimbursements)[number]) =>
      wireTransactionDate({
        ...tx,
        reimbursedAmount: 0,
        remainingReimbursableAmount: 0,
        netAmount: decimalToNumber(tx.amount),
      }),
    ),
    suggested: {
      type: suggestedReimbursementType,
      categoryId: transaction.categoryId,
    },
  }
}

export async function getExpenseCategorySummary(
  familyId: string,
  startDate?: string,
  endDate?: string,
) {
  const dateFilter =
    startDate || endDate
      ? {
          date: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          },
        }
      : {}

  const [expenses, reimbursements] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        familyId,
        type: 'EXPENSE',
        nature: 'NORMAL',
        status: 'CONFIRMED',
        recognition: 'OPERATIONAL',
        ...dateFilter,
      },
      select: {
        amount: true,
        categoryId: true,
        category: { select: { id: true, name: true, type: true } },
      },
    }),
    prisma.transaction.findMany({
      where: {
        familyId,
        type: 'INCOME',
        nature: 'REIMBURSEMENT',
        status: 'CONFIRMED',
        recognition: 'OPERATIONAL',
        ...dateFilter,
        linkedTransaction: {
          type: 'EXPENSE',
          nature: 'NORMAL',
          status: { not: 'DELETED' },
        },
      },
      select: {
        amount: true,
        linkedTransaction: {
          select: {
            categoryId: true,
            category: { select: { id: true, name: true, type: true } },
          },
        },
      },
    }),
  ])

  const byCategory = new Map<string, {
    categoryId: string | null
    name: string
    grossExpense: number
    expenseReimbursements: number
    netExpense: number
  }>()

  const upsertBucket = (categoryId: string | null, name: string) => {
    const key = categoryId ?? '__sem-categoria__'
    const current = byCategory.get(key) ?? {
      categoryId,
      name,
      grossExpense: 0,
      expenseReimbursements: 0,
      netExpense: 0,
    }
    byCategory.set(key, current)
    return current
  }

  for (const tx of expenses) {
    const bucket = upsertBucket(tx.categoryId, tx.category?.name ?? 'Sem categoria')
    bucket.grossExpense += decimalToNumber(tx.amount)
  }

  for (const tx of reimbursements) {
    const linkedCategoryId = tx.linkedTransaction?.categoryId ?? null
    const linkedCategoryName = tx.linkedTransaction?.category?.name ?? 'Sem categoria'
    const bucket = upsertBucket(linkedCategoryId, linkedCategoryName)
    bucket.expenseReimbursements += decimalToNumber(tx.amount)
  }

  const categories = Array.from(byCategory.values()).map((row) => ({
    ...row,
    netExpense: row.grossExpense - row.expenseReimbursements,
  }))

  const totalGrossExpense = categories.reduce((sum, row) => sum + row.grossExpense, 0)
  const totalExpenseReimbursements = categories.reduce((sum, row) => sum + row.expenseReimbursements, 0)
  const totalNetExpense = categories.reduce((sum, row) => sum + row.netExpense, 0)

  return {
    period: { startDate: startDate ?? null, endDate: endDate ?? null },
    totalGrossExpense,
    totalExpenseReimbursements,
    totalNetExpense,
    categories: categories.sort((a, b) => b.netExpense - a.netExpense),
  }
}

type DashboardSummaryQuery = {
  startDate?: string
  endDate?: string
  liquidated?: boolean
}

export async function getDashboardSummary(familyId: string, query: DashboardSummaryQuery) {
  const dateFilter =
    query.startDate || query.endDate
      ? {
          date: {
            ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
            ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
          },
        }
      : {}

  const baseWhere = {
    familyId,
    status: 'CONFIRMED' as const,
    recognition: 'OPERATIONAL' as const,
    ...(query.liquidated !== undefined ? { liquidated: query.liquidated } : {}),
    ...dateFilter,
  }

  const [grossIncomeAgg, grossExpenseAgg, expenseReimbursementsAgg, incomeReversalsAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...baseWhere, type: 'INCOME', nature: 'NORMAL' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...baseWhere,
        type: 'EXPENSE',
        nature: 'NORMAL',
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...baseWhere,
        type: 'INCOME',
        nature: 'REIMBURSEMENT',
        linkedTransaction: {
          type: 'EXPENSE',
          nature: 'NORMAL',
        },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...baseWhere,
        type: 'EXPENSE',
        nature: 'REIMBURSEMENT',
        linkedTransaction: {
          type: 'INCOME',
          nature: 'NORMAL',
        },
      },
      _sum: { amount: true },
    }),
  ])

  const grossIncome = decimalToNumber(grossIncomeAgg._sum?.amount)
  const grossExpense = decimalToNumber(grossExpenseAgg._sum?.amount)
  const expenseReimbursements = decimalToNumber(expenseReimbursementsAgg._sum?.amount)
  const incomeReversals = decimalToNumber(incomeReversalsAgg._sum?.amount)
  const netIncome = grossIncome - incomeReversals
  const netExpense = grossExpense - expenseReimbursements
  const netResult = netIncome - netExpense
  const cashIn = grossIncome + expenseReimbursements
  const cashOut = grossExpense + incomeReversals

  return {
    grossIncome,
    grossExpense,
    expenseReimbursements,
    incomeReversals,
    netIncome,
    netExpense,
    netResult,
    cashIn,
    cashOut,
  }
}

/**
 * Cria uma transação simples (sem parcelamento).
 * Se isRecurring=true, gera imediatamente as próximas ocorrências (90 dias).
 */
export async function createTransaction(familyId: string, userId: string, input: CreateTransactionInput) {
  const accountId = await resolveTransactionAccountId(
    familyId,
    input.accountId,
    input.creditCardId,
  )

  const nature = input.nature ?? 'NORMAL'
  let categoryId: string | null | undefined = input.categoryId ?? null
  let linkedTransactionId: string | null = null

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, familyId },
      include: { _count: { select: { subcategories: true } } },
    })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
    assertCategoryIsLeafForTransaction(category)
  }

  if (nature === 'REIMBURSEMENT') {
    if (!input.linkedTransactionId) {
      throw Object.assign(new Error('linkedTransactionId é obrigatório para reembolso'), { statusCode: 400 })
    }
    const reimbursementValidation = await validateReimbursementLink({
      familyId,
      linkedTransactionId: input.linkedTransactionId,
      transactionType: input.type,
      amount: input.amount,
      categoryId,
      reimbursementOverflowReason: input.reimbursementOverflowReason,
    })
    linkedTransactionId = reimbursementValidation.linkedTransaction.id
    categoryId = reimbursementValidation.resolvedCategoryId
  }

  const { status, confirmedAt } = statusForNewTransaction(input.confirmed)

  const txDate = parsePlainDate(input.date)
  const resolvedInvoiceId =
    input.creditCardId !== undefined && input.creditCardId !== null
      ? await resolveCreditCardInvoiceIdForPurchaseDate(familyId, input.creditCardId, txDate)
      : null

  const transaction = await prisma.transaction.create({
    data: {
      familyId,
      accountId,
      categoryId,
      createdById: userId,
      type: input.type,
      nature,
      linkedTransactionId,
      status,
      confirmedAt,
      amount: input.amount,
      description: input.description,
      notes: input.notes,
      date: txDate,
      source: input.source,
      isRecurring: input.isRecurring,
      rrule: input.rrule,
      creditCardId: input.creditCardId ?? null,
      creditCardInvoiceId: resolvedInvoiceId,
      liquidated: input.liquidated ?? false,
    },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
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

  // Após criar template recorrente, gera imediatamente os próximos 90 dias de drafts
  if (input.isRecurring && input.rrule) {
    const today = new Date()
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + 90)
    generateOccurrences(today, endDate).catch((err) => {
      console.error('[RecurringService] Erro ao gerar ocorrências iniciais:', err)
    })
  }

  const [withMetrics] = await appendReimbursementMetrics(familyId, [transaction])
  return wireTransactionDate(withMetrics)
}

/**
 * Cria transação parcelada: N drafts com mesmo installmentGroupId.
 * Datas são calculadas mensalmente a partir da data inicial.
 */
export async function createInstallmentTransaction(
  familyId: string,
  userId: string,
  input: CreateTransactionInput & { installmentCount: number },
) {
  if ((input.nature ?? 'NORMAL') !== 'NORMAL') {
    throw Object.assign(
      new Error('Parcelamento disponível apenas para transações com nature=NORMAL'),
      { statusCode: 400 },
    )
  }

  const accountId = await resolveTransactionAccountId(
    familyId,
    input.accountId,
    input.creditCardId,
  )

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, familyId },
      include: { _count: { select: { subcategories: true } } },
    })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
    assertCategoryIsLeafForTransaction(category)
  }

  const installmentGroupId = randomUUID()
  const baseDate = parsePlainDate(input.date)
  const { status, confirmedAt } = statusForNewTransaction(input.confirmed)

  const transactions = await prisma.$transaction(async () => {
    const rows = []
    for (let i = 0; i < input.installmentCount; i++) {
      const installmentDate = new Date(baseDate)
      installmentDate.setMonth(installmentDate.getMonth() + i)
      const invId =
        input.creditCardId !== undefined && input.creditCardId !== null
          ? await resolveCreditCardInvoiceIdForPurchaseDate(familyId, input.creditCardId, installmentDate)
          : null

      const row = await prisma.transaction.create({
        data: {
          familyId,
          accountId,
          categoryId: input.categoryId,
          createdById: userId,
          type: input.type,
          nature: 'NORMAL',
          linkedTransactionId: null,
          status,
          confirmedAt,
          amount: input.amount,
          description: `${input.description} (${i + 1}/${input.installmentCount})`,
          notes: input.notes,
          date: installmentDate,
          source: input.source ?? 'MANUAL',
          creditCardId: input.creditCardId,
          creditCardInvoiceId: invId,
          installmentGroupId,
          installmentIndex: i + 1,
          installmentCount: input.installmentCount,
          liquidated: input.liquidated ?? false,
        },
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, type: true } },
          createdBy: { select: { id: true, name: true } },
          creditCard: { select: { id: true, name: true } },
        },
      })
      rows.push(row)
    }
    return rows
  })

  return {
    installmentGroupId,
    installmentCount: input.installmentCount,
    transactions: transactions.map(wireTransactionDate),
  }
}

/** Lista todos os templates de recorrência da família (isRecurring=true). */
export async function listRecurringTemplates(familyId: string) {
  const templates = await prisma.transaction.findMany({
    where: { familyId, isRecurring: true, status: { not: 'DELETED' } },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
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
    orderBy: { createdAt: 'desc' },
  })

  const templatesWithMetrics = await appendReimbursementMetrics(familyId, templates)

  return templatesWithMetrics.map((t) => {
    let nextOccurrences: string[] = []
    if (t.rrule) {
      try {
        const rule = RRule.fromString(t.rrule)
        const today = new Date()
        const end = new Date(today)
        end.setDate(end.getDate() + 90)
        nextOccurrences = rule.between(today, end, true).slice(0, 5).map((d) => d.toISOString().slice(0, 10))
      } catch {
        // rrule inválida — ignora
      }
    }
    return wireTransactionDate({ ...t, nextOccurrences })
  })
}

/**
 * Cancela um template recorrente: soft-delete no template e em todos os drafts futuros gerados por ele.
 */
export async function cancelRecurringTemplate(familyId: string, templateId: string) {
  const template = await prisma.transaction.findFirst({
    where: { id: templateId, familyId, isRecurring: true },
  })
  if (!template) throw Object.assign(new Error('Template recorrente não encontrado'), { statusCode: 404 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Soft-delete os drafts futuros gerados por esse template
  await prisma.transaction.updateMany({
    where: {
      familyId,
      recurringTemplateId: templateId,
      status: 'DRAFT',
      date: { gte: today },
    },
    data: { status: 'DELETED' },
  })

  // Soft-delete o próprio template
  return prisma.transaction.update({
    where: { id: templateId },
    data: { status: 'DELETED' },
  })
}

export async function confirmTransaction(familyId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })
  if (transaction.status === 'CONFIRMED') {
    throw Object.assign(new Error('Transação já confirmada'), { statusCode: 409 })
  }
  if (transaction.status === 'DELETED') {
    throw Object.assign(new Error('Não é possível confirmar transação excluída'), { statusCode: 409 })
  }

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
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
  const [withMetrics] = await appendReimbursementMetrics(familyId, [updated])
  return wireTransactionDate(withMetrics)
}

export async function bulkConfirm(familyId: string, input: BulkConfirmInput) {
  const { count } = await prisma.transaction.updateMany({
    where: {
      id: { in: input.ids },
      familyId,
      status: 'DRAFT',
    },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  })
  return { confirmed: count }
}

function categoryMatchesTransactionType(
  categoryType: 'INCOME' | 'EXPENSE' | 'BOTH',
  transactionType: 'INCOME' | 'EXPENSE',
): boolean {
  return categoryType === 'BOTH' || categoryType === transactionType
}

export async function bulkSetCategory(familyId: string, input: BulkSetCategoryInput) {
  const uniqueIds = [...new Set(input.ids)]
  const txs = await prisma.transaction.findMany({
    where: {
      id: { in: uniqueIds },
      familyId,
      status: 'DRAFT',
    },
    select: { id: true, type: true },
  })

  if (txs.length !== uniqueIds.length) {
    throw Object.assign(
      new Error('Uma ou mais transações não foram encontradas ou não estão em rascunho'),
      { statusCode: 400 },
    )
  }

  const types = new Set(
    (txs as Array<{ id: string; type: 'INCOME' | 'EXPENSE' }>).map((t) => t.type),
  )
  if (types.size !== 1) {
    throw Object.assign(
      new Error('Selecione apenas receitas ou apenas despesas para definir categoria em lote'),
      { statusCode: 400 },
    )
  }

  const transactionType = txs[0]!.type
  const categoryIdToSet = input.categoryId === undefined || input.categoryId === null ? null : input.categoryId

  if (categoryIdToSet !== null) {
    const category = await prisma.category.findFirst({
      where: { id: categoryIdToSet, familyId },
      include: { _count: { select: { subcategories: true } } },
    })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
    if (!categoryMatchesTransactionType(category.type, transactionType)) {
      throw Object.assign(
        new Error('Categoria incompatível com o tipo das transações selecionadas'),
        { statusCode: 400 },
      )
    }
    assertCategoryIsLeafForTransaction(category)
  }

  const { count } = await prisma.transaction.updateMany({
    where: {
      id: { in: uniqueIds },
      familyId,
      status: 'DRAFT',
    },
    data: { categoryId: categoryIdToSet },
  })

  return { updated: count }
}

export async function updateTransaction(
  familyId: string,
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput,
) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId },
    include: {
      linkedTransaction: {
        select: { id: true, type: true, nature: true, categoryId: true, amount: true },
      },
    },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })
  if (transaction.status === 'DELETED') {
    throw Object.assign(new Error('Não é possível editar transação excluída'), { statusCode: 409 })
  }

  const invoiceContext = await assertCardTransactionIsMutable({
    familyId,
    transaction: {
      id: transaction.id,
      creditCardId: transaction.creditCardId,
      creditCardInvoiceId: transaction.creditCardInvoiceId,
      date: transaction.date,
      description: transaction.description,
    },
    changeReason: input.changeReason,
  })

  const nextNature = input.nature ?? transaction.nature
  const amount = input.amount ?? decimalToNumber(transaction.amount)
  const type = transaction.type
  const reimbursementOverflowReason = input.reimbursementOverflowReason

  const providedLinkedTransactionId =
    input.linkedTransactionId === null
      ? null
      : input.linkedTransactionId !== undefined
        ? input.linkedTransactionId
        : transaction.linkedTransactionId

  let resolvedLinkedTransactionId: string | null = providedLinkedTransactionId
  let resolvedCategoryId =
    input.categoryId !== undefined ? input.categoryId : transaction.categoryId

  if (input.categoryId !== undefined && input.categoryId !== null) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, familyId },
      include: { _count: { select: { subcategories: true } } },
    })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
    if (!categoryMatchesTransactionType(category.type, transaction.type)) {
      throw Object.assign(
        new Error('Categoria incompatível com o tipo da transação'),
        { statusCode: 400 },
      )
    }
    assertCategoryIsLeafForTransaction(category)
  }

  if (nextNature === 'REIMBURSEMENT') {
    if (!resolvedLinkedTransactionId) {
      throw Object.assign(new Error('linkedTransactionId é obrigatório para reembolso'), { statusCode: 400 })
    }

    const reimbursementValidation = await validateReimbursementLink({
      familyId,
      linkedTransactionId: resolvedLinkedTransactionId,
      transactionType: type,
      amount,
      categoryId: resolvedCategoryId,
      currentTransactionId: transaction.id,
      reimbursementOverflowReason,
    })

    resolvedLinkedTransactionId = reimbursementValidation.linkedTransaction.id
    resolvedCategoryId = reimbursementValidation.resolvedCategoryId
  } else if (input.linkedTransactionId !== undefined || input.nature !== undefined) {
    resolvedLinkedTransactionId = null
  }

  if (input.accountId !== undefined) {
    const acc = await prisma.account.findFirst({
      where: { id: input.accountId, familyId },
    })
    if (!acc) {
      throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })
    }
  }

  const nextDate = input.date !== undefined ? parsePlainDate(input.date) : transaction.date
  const nextCreditCardInvoiceId =
    transaction.creditCardId && input.date !== undefined
      ? await resolveCreditCardInvoiceIdForPurchaseDate(familyId, transaction.creditCardId, nextDate)
      : undefined

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      ...(input.categoryId !== undefined || nextNature === 'REIMBURSEMENT'
        ? { categoryId: resolvedCategoryId }
        : {}),
      ...(input.nature !== undefined ? { nature: nextNature } : {}),
      ...(input.linkedTransactionId !== undefined || input.nature !== undefined
        ? { linkedTransactionId: resolvedLinkedTransactionId }
        : {}),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.date !== undefined && { date: parsePlainDate(input.date) }),
      ...(input.liquidated !== undefined && { liquidated: input.liquidated }),
      ...(input.accountId !== undefined && { accountId: input.accountId }),
      ...(nextCreditCardInvoiceId !== undefined ? { creditCardInvoiceId: nextCreditCardInvoiceId } : {}),
    },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
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

  if (invoiceContext) {
    await createInvoiceEvent({
      familyId,
      creditCardId: invoiceContext.card.id,
      invoiceId: invoiceContext.invoice.id,
      actorUserId: userId,
      action: 'TRANSACTION_UPDATED',
      transactionId: transaction.id,
      reason: input.changeReason ?? null,
      payloadBefore: {
        amount: decimalToNumber(transaction.amount),
        date: transaction.date.toISOString(),
        description: transaction.description,
        liquidated: transaction.liquidated,
      },
      payloadAfter: {
        amount: decimalToNumber(updated.amount),
        date: updated.date.toISOString(),
        description: updated.description,
        liquidated: updated.liquidated,
      },
    })
    await ensureInvoiceRowsForCreditCardFromActivity(
      invoiceContext.card.id,
      invoiceContext.card.closingDay,
      invoiceContext.card.dueDay,
    )
    await reconcileInvoiceStatesForCard(
      invoiceContext.card.id,
      invoiceContext.card.closingDay,
      invoiceContext.card.dueDay,
    )
  }

  const [withMetrics] = await appendReimbursementMetrics(familyId, [updated])
  return wireTransactionDate(withMetrics)
}

export async function deleteTransaction(
  familyId: string,
  userId: string,
  transactionId: string,
  input: DeleteTransactionInput,
) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })

  const invoiceContext = await assertCardTransactionIsMutable({
    familyId,
    transaction: {
      id: transaction.id,
      creditCardId: transaction.creditCardId,
      creditCardInvoiceId: transaction.creditCardInvoiceId,
      date: transaction.date,
      description: transaction.description,
    },
    changeReason: input.changeReason,
  })

  const deleted = await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: 'DELETED' },
  })

  if (invoiceContext) {
    await createInvoiceEvent({
      familyId,
      creditCardId: invoiceContext.card.id,
      invoiceId: invoiceContext.invoice.id,
      actorUserId: userId,
      action: 'TRANSACTION_DELETED',
      transactionId: transaction.id,
      reason: input.changeReason ?? null,
      payloadBefore: {
        amount: decimalToNumber(transaction.amount),
        date: transaction.date.toISOString(),
        description: transaction.description,
        liquidated: transaction.liquidated,
        status: transaction.status,
      },
      payloadAfter: {
        status: 'DELETED',
      },
    })
    await ensureInvoiceRowsForCreditCardFromActivity(
      invoiceContext.card.id,
      invoiceContext.card.closingDay,
      invoiceContext.card.dueDay,
    )
    await reconcileInvoiceStatesForCard(
      invoiceContext.card.id,
      invoiceContext.card.closingDay,
      invoiceContext.card.dueDay,
    )
  }

  return deleted
}

export async function restoreTransaction(familyId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId, status: 'DELETED' },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada na lixeira'), { statusCode: 404 })

  const nextStatus = transaction.confirmedAt ? 'CONFIRMED' : 'DRAFT'

  const restored = await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: nextStatus },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
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

  const [withMetrics] = await appendReimbursementMetrics(familyId, [restored])
  return wireTransactionDate(withMetrics)
}

export async function permanentlyDeleteTransaction(familyId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId, status: 'DELETED' },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada na lixeira'), { statusCode: 404 })

  const transferId = transaction.transferId

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.transactionDraft.deleteMany({ where: { transactionId } })
    await tx.transaction.delete({ where: { id: transactionId } })
    if (transferId) {
      const remaining = await tx.transaction.count({ where: { transferId } })
      if (remaining === 0) {
        await tx.transfer.delete({ where: { id: transferId } })
      }
    }
  })
}

/** Remove todas as transações em status DELETED da família (delete físico). */
export async function emptyTransactionTrash(familyId: string): Promise<{ deleted: number }> {
  const rows = await prisma.transaction.findMany({
    where: { familyId, status: 'DELETED' },
    select: { id: true },
  })
  for (const { id } of rows) {
    await permanentlyDeleteTransaction(familyId, id)
  }
  return { deleted: rows.length }
}
