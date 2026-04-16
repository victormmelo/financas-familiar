import { parsePlainDate } from '@financas/shared-types'
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

export async function listTransactions(familyId: string, query: ListTransactionsInput) {
  const { page, limit, accountId, categoryId, type, status, startDate, endDate, isRecurring, liquidated } = query
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
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })
  return transaction
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

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, familyId },
      include: { _count: { select: { subcategories: true } } },
    })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
    assertCategoryIsLeafForTransaction(category)
  }

  const { status, confirmedAt } = statusForNewTransaction(input.confirmed)

  const transaction = await prisma.transaction.create({
    data: {
      familyId,
      accountId,
      categoryId: input.categoryId,
      createdById: userId,
      type: input.type,
      status,
      confirmedAt,
      amount: input.amount,
      description: input.description,
      notes: input.notes,
      date: parsePlainDate(input.date),
      source: input.source,
      isRecurring: input.isRecurring,
      rrule: input.rrule,
      creditCardId: input.creditCardId ?? null,
      liquidated: input.liquidated ?? false,
    },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
      creditCard: { select: { id: true, name: true } },
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

  const transactions = await prisma.$transaction(
    Array.from({ length: input.installmentCount }, (_, i) => {
      const installmentDate = new Date(baseDate)
      installmentDate.setMonth(installmentDate.getMonth() + i)

      return prisma.transaction.create({
        data: {
          familyId,
          accountId,
          categoryId: input.categoryId,
          createdById: userId,
          type: input.type,
          status,
          confirmedAt,
          amount: input.amount,
          description: `${input.description} (${i + 1}/${input.installmentCount})`,
          notes: input.notes,
          date: installmentDate,
          source: input.source ?? 'MANUAL',
          creditCardId: input.creditCardId,
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
      creditCard: { select: { id: true, name: true } },
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

export async function updateTransaction(familyId: string, transactionId: string, input: UpdateTransactionInput) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })
  if (transaction.status === 'DELETED') {
    throw Object.assign(new Error('Não é possível editar transação excluída'), { statusCode: 409 })
  }

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

  return prisma.transaction.update({
    where: { id: transactionId },
    data: {
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.date !== undefined && { date: parsePlainDate(input.date) }),
      ...(input.liquidated !== undefined && { liquidated: input.liquidated }),
    },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
      creditCard: { select: { id: true, name: true } },
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

export async function restoreTransaction(familyId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId, status: 'DELETED' },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada na lixeira'), { statusCode: 404 })

  const nextStatus = transaction.confirmedAt ? 'CONFIRMED' : 'DRAFT'

  return prisma.transaction.update({
    where: { id: transactionId },
    data: { status: nextStatus },
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
      creditCard: { select: { id: true, name: true } },
    },
  })
}

export async function permanentlyDeleteTransaction(familyId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, familyId, status: 'DELETED' },
  })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada na lixeira'), { statusCode: 404 })

  const transferId = transaction.transferId

  await prisma.$transaction(async (tx) => {
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
