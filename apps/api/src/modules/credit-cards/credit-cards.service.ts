import { wireTransactionDate } from '@financas/shared-types'
import { prisma } from '../../lib/prisma.js'
import { netCardSpendingInPeriod } from '../../lib/credit-card-spending.js'
import {
  ensureInvoiceRowsForCreditCardFromActivity,
  reconcileInvoiceStatesForCard,
  shiftCalendarMonthUtc,
} from '../../lib/credit-card-invoices-sync.js'
import type { Prisma } from '@prisma/client'
import type {
  CreateCreditCardInput,
  UpdateCreditCardInput,
  ListInvoicesInput,
  PayInvoiceInput,
  CreateInvoiceSettlementInput,
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

function monthDateRange(referenceYear: number, referenceMonth: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(referenceYear, referenceMonth - 1, 1),
    lt: new Date(referenceYear, referenceMonth, 1),
  }
}

function getDueDateDate(referenceMonth: number, referenceYear: number, dueDay: number): Date {
  return new Date(`${calculateDueDate(referenceMonth, referenceYear, dueDay)}T00:00:00.000Z`)
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

  await ensureInvoiceRowsForCreditCardFromActivity(card.id, card.closingDay, card.dueDay)
  const ledger = await reconcileInvoiceStatesForCard(card.id, card.closingDay, card.dueDay)
  const ledgerByInvoiceId = new Map(ledger.map((line) => [line.invoiceId, line]))

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
      carriedAmount: ledgerByInvoiceId.get(inv.id)?.carriedAmount ?? 0,
      negotiatedInstallmentAmount: ledgerByInvoiceId.get(inv.id)?.negotiatedInstallmentAmount ?? 0,
      paymentAmount: ledgerByInvoiceId.get(inv.id)?.paymentAmount ?? 0,
      outstandingAmount: ledgerByInvoiceId.get(inv.id)?.outstandingAmount ?? 0,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

async function getLedgerLineOrThrow(familyId: string, cardId: string, invoiceId: string) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, familyId } })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  await ensureInvoiceRowsForCreditCardFromActivity(card.id, card.closingDay, card.dueDay)
  const ledger = await reconcileInvoiceStatesForCard(card.id, card.closingDay, card.dueDay)
  const line = ledger.find((item) => item.invoiceId === invoiceId)
  if (!line) throw Object.assign(new Error('Fatura não encontrada'), { statusCode: 404 })

  return { card, line }
}

export async function getInvoiceStatement(familyId: string, cardId: string, invoiceId: string) {
  const [{ card, line }, invoice, payments, settlement] = await Promise.all([
    getLedgerLineOrThrow(familyId, cardId, invoiceId),
    prisma.creditCardInvoice.findFirst({
      where: { id: invoiceId, creditCardId: cardId },
      include: { paidFromAccount: { select: { id: true, name: true } } },
    }),
    prisma.transaction.findMany({
      where: {
        creditCardId: cardId,
        creditCardInvoiceId: invoiceId,
        recognition: 'INVOICE_PAYMENT',
        status: { not: 'DELETED' },
      },
      orderBy: { date: 'desc' },
      include: { account: { select: { id: true, name: true } } },
    }),
    prisma.creditCardInvoiceSettlement.findFirst({
      where: { invoiceId, creditCardId: cardId },
      include: { installments: { orderBy: { sequence: 'asc' } } },
    }),
  ])

  if (!invoice) throw Object.assign(new Error('Fatura não encontrada'), { statusCode: 404 })

  return {
    invoice: {
      ...invoice,
      dueDate: calculateDueDate(invoice.referenceMonth, invoice.referenceYear, card.dueDay),
    },
    breakdown: {
      cycleAmount: line.cycleAmount,
      carriedAmount: line.carriedAmount,
      negotiatedInstallmentAmount: line.negotiatedInstallmentAmount,
      paymentAmount: line.paymentAmount,
      totalAmount: line.totalAmount,
      outstandingAmount: line.outstandingAmount,
      status: line.status,
    },
    payments: payments.map(wireTransactionDate),
    settlement,
  }
}

export async function getInvoice(familyId: string, cardId: string, invoiceId: string) {
  const { card, line } = await getLedgerLineOrThrow(familyId, cardId, invoiceId)

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
    carriedAmount: line.carriedAmount,
    negotiatedInstallmentAmount: line.negotiatedInstallmentAmount,
    paymentAmount: line.paymentAmount,
    outstandingAmount: line.outstandingAmount,
    transactions: transactions.map(wireTransactionDate),
  }
}

export async function getCurrentInvoice(familyId: string, cardId: string) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, familyId } })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  await ensureInvoiceRowsForCreditCardFromActivity(card.id, card.closingDay, card.dueDay)
  const ledger = await reconcileInvoiceStatesForCard(card.id, card.closingDay, card.dueDay)

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
      totalAmount: 0,
    },
    update: {},
    include: { paidFromAccount: { select: { id: true, name: true } } },
  })

  const line = ledger.find((item) => item.invoiceId === invoice.id)

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
    carriedAmount: line?.carriedAmount ?? 0,
    negotiatedInstallmentAmount: line?.negotiatedInstallmentAmount ?? 0,
    paymentAmount: line?.paymentAmount ?? 0,
    outstandingAmount: line?.outstandingAmount ?? 0,
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
  if (invoice.status === 'RENEGOTIATED')
    throw Object.assign(new Error('Fatura renegociada não aceita pagamento direto'), { statusCode: 409 })

  const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  const statement = await getInvoiceStatement(familyId, cardId, invoiceId)
  if (statement.breakdown.outstandingAmount <= 0) {
    throw Object.assign(new Error('Fatura já foi quitada'), { statusCode: 409 })
  }
  const amountToPay = input.amount ?? statement.breakdown.outstandingAmount
  if (amountToPay > statement.breakdown.outstandingAmount) {
    throw Object.assign(new Error('Pagamento não pode exceder saldo em aberto'), { statusCode: 400 })
  }

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
        paidFromAccountId: input.accountId,
      },
    })
  })

  await reconcileInvoiceStatesForCard(card.id, card.closingDay, card.dueDay)
  return getInvoiceStatement(familyId, cardId, invoiceId)
}

export async function createInvoiceSettlement(
  familyId: string,
  userId: string,
  cardId: string,
  invoiceId: string,
  input: CreateInvoiceSettlementInput,
) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, familyId } })
  if (!card) throw Object.assign(new Error('Cartão não encontrado'), { statusCode: 404 })

  const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  const invoice = await prisma.creditCardInvoice.findFirst({
    where: { id: invoiceId, creditCardId: cardId },
  })
  if (!invoice) throw Object.assign(new Error('Fatura não encontrada'), { statusCode: 404 })

  const existingSettlement = await prisma.creditCardInvoiceSettlement.findFirst({
    where: { invoiceId, status: 'ACTIVE' },
  })
  if (existingSettlement) {
    throw Object.assign(new Error('Fatura já possui negociação ativa'), { statusCode: 409 })
  }

  const statement = await getInvoiceStatement(familyId, cardId, invoiceId)
  if (statement.breakdown.outstandingAmount <= 0) {
    throw Object.assign(new Error('Não há saldo pendente para negociar'), { statusCode: 400 })
  }

  const downPayment = input.downPayment ?? 0
  const installmentsTotal = input.installmentCount * input.installmentAmount
  const negotiatedTotal = downPayment + installmentsTotal
  if (negotiatedTotal < statement.breakdown.outstandingAmount) {
    throw Object.assign(new Error('Total negociado não pode ser menor que o saldo pendente'), {
      statusCode: 400,
    })
  }

  const dueDate = getDueDateDate(invoice.referenceMonth, invoice.referenceYear, card.dueDay)
  if (
    input.firstInstallmentYear < dueDate.getUTCFullYear() ||
    (input.firstInstallmentYear === dueDate.getUTCFullYear() &&
      input.firstInstallmentMonth < dueDate.getUTCMonth() + 1)
  ) {
    throw Object.assign(
      new Error('Primeira parcela não pode iniciar antes do mês de vencimento da fatura'),
      { statusCode: 400 },
    )
  }

  const settlement = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.creditCardInvoiceSettlement.create({
      data: {
        familyId,
        creditCardId: cardId,
        invoiceId,
        totalOriginal: statement.breakdown.outstandingAmount,
        downPayment,
        negotiatedTotal,
        installmentCount: input.installmentCount,
        firstInstallmentMonth: input.firstInstallmentMonth,
        firstInstallmentYear: input.firstInstallmentYear,
        createdById: userId,
      },
    })

    await tx.creditCardInvoiceSettlementInstallment.createMany({
      data: Array.from({ length: input.installmentCount }, (_, index) => {
        const due = shiftCalendarMonthUtc(
          input.firstInstallmentYear,
          input.firstInstallmentMonth,
          index,
        )
        return {
          settlementId: created.id,
          sequence: index + 1,
          dueReferenceMonth: due.month,
          dueReferenceYear: due.year,
          amount: input.installmentAmount,
        }
      }),
    })

    if (downPayment > 0) {
      await tx.transaction.create({
        data: {
          familyId,
          accountId: input.accountId,
          createdById: userId,
          type: 'EXPENSE',
          nature: 'NORMAL',
          status: 'CONFIRMED',
          amount: downPayment,
          description: `Entrada negociação fatura ${card.name} ${String(invoice.referenceMonth).padStart(2, '0')}/${invoice.referenceYear}`,
          date: new Date(),
          source: 'MANUAL',
          recognition: 'INVOICE_PAYMENT',
          creditCardInvoiceId: invoiceId,
          confirmedAt: new Date(),
          liquidated: true,
        },
      })
    }

    await tx.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'RENEGOTIATED',
        renegotiatedAt: new Date(),
        paidFromAccountId: downPayment > 0 ? input.accountId : null,
      },
    })

    return created
  })

  await ensureInvoiceRowsForCreditCardFromActivity(card.id, card.closingDay, card.dueDay)
  await reconcileInvoiceStatesForCard(card.id, card.closingDay, card.dueDay)

  return prisma.creditCardInvoiceSettlement.findUniqueOrThrow({
    where: { id: settlement.id },
    include: {
      installments: { orderBy: { sequence: 'asc' } },
    },
  })
}
