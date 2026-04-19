import { wireTransactionDate } from '@financas/shared-types'
import { prisma } from '../../lib/prisma.js'
import { netCardSpendingInPeriod } from '../../lib/credit-card-spending.js'
import { ensureInvoiceRowsForCreditCardFromActivity } from '../../lib/credit-card-invoices-sync.js'
import type { Prisma } from '@prisma/client'
import type {
  CreateCreditCardInput,
  UpdateCreditCardInput,
  ListInvoicesInput,
  PayInvoiceInput,
} from './credit-cards.schema.js'

/** Calcula a data de vencimento de uma fatura com base no cartão. */
function calculateDueDate(referenceMonth: number, referenceYear: number, dueDay: number): string {
  // Vencimento é no mês seguinte ao fechamento
  const dueMonth = referenceMonth === 12 ? 1 : referenceMonth + 1
  const dueYear = referenceMonth === 12 ? referenceYear + 1 : referenceYear
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
}

async function getInvoiceSpending(cardId: string, month: number, year: number): Promise<number> {
  return netCardSpendingInPeriod(cardId, {
    gte: new Date(year, month - 1, 1),
    lt: new Date(year, month, 1),
  })
}

const cardDefaultAccountInclude = {
  defaultAccount: { select: { id: true, name: true } },
} as const

export async function listCreditCards(familyId: string) {
  const cards = await prisma.creditCard.findMany({
    where: { familyId },
    orderBy: { createdAt: 'asc' },
    include: cardDefaultAccountInclude,
  })

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  return Promise.all(
    cards.map(async (card: (typeof cards)[number]) => {
      const currentSpending = await getInvoiceSpending(card.id, month, year)
      return { ...card, currentSpending }
    }),
  )
}

export async function getCreditCard(familyId: string, cardId: string) {
  const card = await prisma.creditCard.findFirst({
    where: { id: cardId, familyId },
    include: cardDefaultAccountInclude,
  })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  const now = new Date()
  const currentSpending = await getInvoiceSpending(card.id, now.getMonth() + 1, now.getFullYear())
  return { ...card, currentSpending }
}

export async function createCreditCard(familyId: string, input: CreateCreditCardInput) {
  const account = await prisma.account.findFirst({
    where: { id: input.defaultAccountId, familyId },
  })
  if (!account) throw Object.assign(new Error('Conta padrão não encontrada'), { statusCode: 404 })

  return prisma.creditCard.create({
    data: {
      familyId,
      name: input.name,
      limit: input.limit,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      defaultAccountId: input.defaultAccountId,
      color: input.color,
      icon: input.icon,
    },
    include: cardDefaultAccountInclude,
  })
}

export async function updateCreditCard(
  familyId: string,
  cardId: string,
  input: UpdateCreditCardInput,
) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, familyId } })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  if (input.defaultAccountId !== undefined && input.defaultAccountId !== null) {
    const acc = await prisma.account.findFirst({ where: { id: input.defaultAccountId, familyId } })
    if (!acc) throw Object.assign(new Error('Conta padrão não encontrada'), { statusCode: 404 })
  }

  return prisma.creditCard.update({
    where: { id: cardId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.limit !== undefined && { limit: input.limit }),
      ...(input.closingDay !== undefined && { closingDay: input.closingDay }),
      ...(input.dueDay !== undefined && { dueDay: input.dueDay }),
      ...(input.defaultAccountId !== undefined && { defaultAccountId: input.defaultAccountId }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: cardDefaultAccountInclude,
  })
}

export async function deleteCreditCard(familyId: string, cardId: string) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, familyId } })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  const transactionCount = await prisma.transaction.count({ where: { creditCardId: cardId } })
  if (transactionCount > 0) {
    return prisma.creditCard.update({ where: { id: cardId }, data: { isActive: false } })
  }

  return prisma.creditCard.delete({ where: { id: cardId } })
}

export async function listInvoices(
  familyId: string,
  cardId: string,
  query: ListInvoicesInput,
) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, familyId } })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  await ensureInvoiceRowsForCreditCardFromActivity(card.id, card.closingDay)

  const { page, limit, status } = query
  const skip = (page - 1) * limit

  const where = {
    creditCardId: cardId,
    ...(status && { status }),
  }

  const [invoices, total] = await Promise.all([
    prisma.creditCardInvoice.findMany({
      where,
      orderBy: [{ referenceYear: 'desc' }, { referenceMonth: 'desc' }],
      skip,
      take: limit,
      include: {
        paidFromAccount: { select: { id: true, name: true } },
      },
    }),
    prisma.creditCardInvoice.count({ where }),
  ])

  return {
    data: invoices.map((inv) => ({
      ...inv,
      dueDate: calculateDueDate(inv.referenceMonth, inv.referenceYear, card.dueDay),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

export async function getInvoice(familyId: string, cardId: string, invoiceId: string) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, familyId } })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  const invoice = await prisma.creditCardInvoice.findFirst({
    where: { id: invoiceId, creditCardId: cardId },
    include: { paidFromAccount: { select: { id: true, name: true } } },
  })
  if (!invoice) throw Object.assign(new Error('Fatura não encontrada'), { statusCode: 404 })

  const transactions = await prisma.transaction.findMany({
    where: {
      creditCardId: cardId,
      status: { not: 'DELETED' },
      date: {
        gte: new Date(invoice.referenceYear, invoice.referenceMonth - 1, 1),
        lt: new Date(invoice.referenceYear, invoice.referenceMonth, 1),
      },
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
    },
    orderBy: { date: 'desc' },
  })

  return {
    ...invoice,
    dueDate: calculateDueDate(invoice.referenceMonth, invoice.referenceYear, card.dueDay),
    transactions: transactions.map(wireTransactionDate),
  }
}

export async function getCurrentInvoice(familyId: string, cardId: string) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, familyId } })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const spending = await getInvoiceSpending(cardId, month, year)

  const invoice = await prisma.creditCardInvoice.upsert({
    where: {
      creditCardId_referenceMonth_referenceYear: {
        creditCardId: cardId,
        referenceMonth: month,
        referenceYear: year,
      },
    },
    create: {
      creditCardId: cardId,
      referenceMonth: month,
      referenceYear: year,
      totalAmount: spending,
    },
    update: { totalAmount: spending },
    include: { paidFromAccount: { select: { id: true, name: true } } },
  })

  const transactions = await prisma.transaction.findMany({
    where: {
      creditCardId: cardId,
      status: { not: 'DELETED' },
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
    },
    orderBy: { date: 'desc' },
  })

  return {
    ...invoice,
    dueDate: calculateDueDate(month, year, card.dueDay),
    transactions: transactions.map(wireTransactionDate),
  }
}

export async function payInvoice(
  familyId: string,
  userId: string,
  cardId: string,
  invoiceId: string,
  input: PayInvoiceInput,
) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, familyId } })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  const invoice = await prisma.creditCardInvoice.findFirst({
    where: { id: invoiceId, creditCardId: cardId },
  })
  if (!invoice) throw Object.assign(new Error('Fatura não encontrada'), { statusCode: 404 })
  if (invoice.status === 'PAID')
    throw Object.assign(new Error('Fatura já foi paga'), { statusCode: 409 })

  const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  const amountToPay = input.amount ?? invoice.totalAmount.toNumber()

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.transaction.create({
      data: {
        familyId,
        accountId: input.accountId,
        createdById: userId,
        type: 'EXPENSE',
        nature: 'NORMAL',
        status: 'CONFIRMED',
        amount: amountToPay,
        description: `Pagamento fatura ${card.name} ${String(invoice.referenceMonth).padStart(2, '0')}/${invoice.referenceYear}`,
        date: new Date(),
        source: 'MANUAL',
        recognition: 'INVOICE_PAYMENT',
        creditCardInvoiceId: invoiceId,
        confirmedAt: new Date(),
        liquidated: true,
      },
    })

    await tx.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paidFromAccountId: input.accountId,
      },
    })
  })

  const paid = await prisma.creditCardInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { paidFromAccount: { select: { id: true, name: true } } },
  })

  return {
    ...paid,
    dueDate: calculateDueDate(paid.referenceMonth, paid.referenceYear, card.dueDay),
  }
}
