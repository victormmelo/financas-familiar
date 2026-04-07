import { prisma } from '../../lib/prisma.js'
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  BulkConfirmInput,
  BulkSetCategoryInput,
  ListTransactionsInput,
} from './transactions.schema.js'

export async function listTransactions(familyId: string, query: ListTransactionsInput) {
  const { page, limit, accountId, categoryId, type, status, startDate, endDate } = query
  const skip = (page - 1) * limit

  const where = {
    familyId,
    ...(accountId && { accountId }),
    ...(categoryId && { categoryId }),
    ...(type && { type }),
    ...(status && { status }),
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

export async function createTransaction(familyId: string, userId: string, input: CreateTransactionInput) {
  const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, familyId } })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
  }

  return prisma.transaction.create({
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

  // Soft delete
  return prisma.transaction.update({
    where: { id: transactionId },
    data: { status: 'DELETED' },
  })
}
