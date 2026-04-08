import { prisma } from '../../lib/prisma.js'
import { randomUUID } from 'crypto'
import { RRule } from 'rrule'
import { generateOccurrences } from '../../jobs/recurring-transactions.worker.js'
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  BulkConfirmInput,
  BulkSetCategoryInput,
  ListTransactionsInput,
} from './transactions.schema.js'

export async function listTransactions(familyId: string, query: ListTransactionsInput) {
  const { page, limit, accountId, categoryId, type, status, startDate, endDate, isRecurring } = query
  const skip = (page - 1) * limit

  const where = {
    familyId,
    ...(accountId && { accountId }),
    ...(categoryId && { categoryId }),
    ...(type && { type }),
    ...(status && { status }),
    ...(isRecurring !== undefined && { isRecurring }),
    ...(startDate || endDate
      ? {
          date: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
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
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ])

  return {
    data: transactions,
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
      draft: true,
    },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })
  return transaction
}

/**
 * Cria uma transação simples (sem parcelamento).
 * Se isRecurring=true, gera imediatamente as próximas ocorrências (90 dias).
 */
export async function createTransaction(familyId: string, userId: string, input: CreateTransactionInput) {
  const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, familyId } })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
  }

  const transaction = await prisma.transaction.create({
    data: {
      familyId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      createdById: userId,
      type: input.type,
      status: 'DRAFT',
      amount: input.amount,
      description: input.description,
      notes: input.notes,
      date: new Date(input.date),
      source: input.source,
      isRecurring: input.isRecurring,
      rrule: input.rrule,
    },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
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

  return transaction
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
  const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, familyId } })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
  }

  const installmentGroupId = randomUUID()
  const baseDate = new Date(input.date)

  const transactions = await prisma.$transaction(
    Array.from({ length: input.installmentCount }, (_, i) => {
      const installmentDate = new Date(baseDate)
      installmentDate.setMonth(installmentDate.getMonth() + i)

      return prisma.transaction.create({
        data: {
          familyId,
          accountId: input.accountId,
          categoryId: input.categoryId,
          createdById: userId,
          type: input.type,
          status: 'DRAFT',
          amount: input.amount,
          description: `${input.description} (${i + 1}/${input.installmentCount})`,
          notes: input.notes,
          date: installmentDate,
          source: input.source ?? 'MANUAL',
          creditCardId: input.creditCardId,
          installmentGroupId,
          installmentIndex: i + 1,
          installmentCount: input.installmentCount,
        },
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, type: true } },
          createdBy: { select: { id: true, name: true } },
        },
      })
    }),
  )

  return { installmentGroupId, installmentCount: input.installmentCount, transactions }
}

/** Lista todos os templates de recorrência da família (isRecurring=true). */
export async function listRecurringTemplates(familyId: string) {
  const templates = await prisma.transaction.findMany({
    where: { familyId, isRecurring: true, status: { not: 'DELETED' } },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return templates.map((t) => {
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
    return { ...t, nextOccurrences }
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

  return prisma.transaction.update({
    where: { id: transactionId },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  })
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

  const types = new Set(txs.map((t) => t.type))
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
    })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
    if (!categoryMatchesTransactionType(category.type, transactionType)) {
      throw Object.assign(
        new Error('Categoria incompatível com o tipo das transações selecionadas'),
        { statusCode: 400 },
      )
    }
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

export async function updateTransaction(familyId: string, transactionId: string, input: UpdateTransactionInput) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })
  if (transaction.status === 'DELETED') {
    throw Object.assign(new Error('Não é possível editar transação excluída'), { statusCode: 409 })
  }

  return prisma.transaction.update({
    where: { id: transactionId },
    data: {
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.date !== undefined && { date: new Date(input.date) }),
    },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
    },
  })
}

export async function deleteTransaction(familyId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })

  return prisma.transaction.update({
    where: { id: transactionId },
    data: { status: 'DELETED' },
  })
}
