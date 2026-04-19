import { wireTransactionDate } from '@financas/shared-types'
import { prisma } from '../../lib/prisma.js'
import { netCardSpendingInPeriod } from '../../lib/credit-card-spending.js'
import {
  ensureInvoiceRowsForCreditCardFromActivity,
  reconcileInvoiceStatesForCard,
} from '../../lib/credit-card-invoices-sync.js'
import {
  calculateDueDateIso,
  dueDateUtc,
  dueInvoiceKeyForPurchaseDate,
  purchaseCycleBoundsUtc,
  shiftCalendarMonthUtc,
} from '@financas/shared-types'
import type { Prisma } from '@prisma/client'
import type {
  CreateCreditCardInput,
  UpdateCreditCardInput,
  ListInvoicesInput,
  PayInvoiceInput,
  CreateInvoiceSettlementInput,
  CloseInvoiceManualInput,
  ReopenInvoiceInput,
} from './credit-cards.schema.js'
import { canReopenInvoice } from './invoice-lifecycle.js'

/** Gasto líquido no ciclo aberto atual (referência = mês de vencimento). */
async function getCurrentCycleNetSpending(
  cardId: string,
  closingDay: number,
  dueDay: number,
): Promise<number> {
  try {
    const key = dueInvoiceKeyForPurchaseDate(new Date(), closingDay, dueDay)
    const bounds = purchaseCycleBoundsUtc(key.referenceYear, key.referenceMonth, closingDay, dueDay)
    return netCardSpendingInPeriod(cardId, { gt: bounds.gt, lte: bounds.lte })
  } catch {
    return 0
  }
}

function invoicePurchaseDateFilter(
  referenceYear: number,
  referenceMonth: number,
  closingDay: number,
  dueDay: number,
): { gt: Date; lte: Date } {
  const bounds = purchaseCycleBoundsUtc(referenceYear, referenceMonth, closingDay, dueDay)
  return { gt: bounds.gt, lte: bounds.lte }
}

function getDueDateDate(referenceMonth: number, referenceYear: number, dueDay: number): Date {
  return dueDateUtc(referenceYear, referenceMonth, dueDay)
}

function getOfficialClosingDate(
  referenceMonth: number,
  referenceYear: number,
  closingDay: number,
  dueDay: number,
): Date {
  const bounds = purchaseCycleBoundsUtc(referenceYear, referenceMonth, closingDay, dueDay)
  return new Date(bounds.lte.getTime())
}

type InvoiceEventAction =
  | 'MANUAL_CLOSE'
  | 'MANUAL_REOPEN'
  | 'PAYMENT_CREATED'
  | 'SETTLEMENT_CREATED'
  | 'TRANSACTION_UPDATED'
  | 'TRANSACTION_DELETED'

type JsonInput = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput

export async function createInvoiceEvent(input: {
  familyId: string
  creditCardId: string
  invoiceId: string
  actorUserId: string
  action: InvoiceEventAction
  transactionId?: string
  reason?: string | null
  payloadBefore?: JsonInput
  payloadAfter?: JsonInput
  metadata?: JsonInput
}) {
  await prisma.creditCardInvoiceEvent.create({
    data: {
      familyId: input.familyId,
      creditCardId: input.creditCardId,
      invoiceId: input.invoiceId,
      actorUserId: input.actorUserId,
      action: input.action,
      transactionId: input.transactionId,
      reason: input.reason ?? null,
      payloadBefore: input.payloadBefore,
      payloadAfter: input.payloadAfter,
      metadata: input.metadata,
    },
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

  return Promise.all(
    cards.map(async (card: (typeof cards)[number]) => {
      const currentSpending = await getCurrentCycleNetSpending(card.id, card.closingDay, card.dueDay)
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

  const currentSpending = await getCurrentCycleNetSpending(card.id, card.closingDay, card.dueDay)
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
    data: invoices.map((inv) => {
      const line = ledgerByInvoiceId.get(inv.id)
      return {
        ...inv,
        dueDate: calculateDueDateIso(inv.referenceMonth, inv.referenceYear, card.dueDay),
        officialClosingDate: line?.officialClosingDate ?? null,
        carriedAmount: line?.carriedAmount ?? 0,
        negotiatedInstallmentAmount: line?.negotiatedInstallmentAmount ?? 0,
        paymentAmount: line?.paymentAmount ?? 0,
        outstandingAmount: line?.outstandingAmount ?? 0,
      }
    }),
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
  const { card, line } = await getLedgerLineOrThrow(familyId, cardId, invoiceId)

  const [invoice, payments, settlement, transactions, events] = await Promise.all([
    prisma.creditCardInvoice.findFirst({
      where: { id: invoiceId, creditCardId: cardId },
      include: { paidFromAccount: { select: { id: true, name: true } } },
    }),
    prisma.transaction.findMany({
      where: {
        creditCardInvoiceId: invoiceId,
        recognition: 'INVOICE_PAYMENT',
        status: { not: 'DELETED' },
        creditCardInvoice: { id: invoiceId, creditCardId: cardId },
      },
      orderBy: { date: 'desc' },
      include: { account: { select: { id: true, name: true } } },
    }),
    prisma.creditCardInvoiceSettlement.findFirst({
      where: { invoiceId, creditCardId: cardId },
      include: { installments: { orderBy: { sequence: 'asc' } } },
    }),
    prisma.transaction.findMany({
      where: {
        creditCardId: cardId,
        status: { not: 'DELETED' },
        date: invoicePurchaseDateFilter(
          line.referenceYear,
          line.referenceMonth,
          card.closingDay,
          card.dueDay,
        ),
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.creditCardInvoiceEvent.findMany({
      where: {
        invoiceId,
        familyId,
      },
      include: {
        actor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  if (!invoice) throw Object.assign(new Error('Fatura não encontrada'), { statusCode: 404 })

  return {
    invoice: {
      ...invoice,
      dueDate: calculateDueDateIso(invoice.referenceMonth, invoice.referenceYear, card.dueDay),
      transactions: transactions.map(wireTransactionDate),
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
    events,
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
      date: invoicePurchaseDateFilter(
        invoice.referenceYear,
        invoice.referenceMonth,
        card.closingDay,
        card.dueDay,
      ),
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
    },
    orderBy: { date: 'desc' },
  })

  return {
    ...invoice,
    dueDate: calculateDueDateIso(invoice.referenceMonth, invoice.referenceYear, card.dueDay),
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
  let dueKey: { referenceMonth: number; referenceYear: number }
  try {
    dueKey = dueInvoiceKeyForPurchaseDate(now, card.closingDay, card.dueDay)
  } catch {
    dueKey = { referenceMonth: now.getUTCMonth() + 1, referenceYear: now.getUTCFullYear() }
  }

  await ensureInvoiceRowsForCreditCardFromActivity(card.id, card.closingDay, card.dueDay)
  const ledger = await reconcileInvoiceStatesForCard(card.id, card.closingDay, card.dueDay)

  const invoice = await prisma.creditCardInvoice.upsert({
    where: {
      creditCardId_referenceMonth_referenceYear: {
        creditCardId: cardId,
        referenceMonth: dueKey.referenceMonth,
        referenceYear: dueKey.referenceYear,
      },
    },
    create: {
      creditCardId: cardId,
      referenceMonth: dueKey.referenceMonth,
      referenceYear: dueKey.referenceYear,
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
      date: invoicePurchaseDateFilter(
        dueKey.referenceYear,
        dueKey.referenceMonth,
        card.closingDay,
        card.dueDay,
      ),
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
    },
    orderBy: { date: 'desc' },
  })

  return {
    ...invoice,
    dueDate: calculateDueDateIso(dueKey.referenceMonth, dueKey.referenceYear, card.dueDay),
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

  let paymentTransactionId: string | null = null
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const payment = await tx.transaction.create({
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
        creditCardId: cardId,
        creditCardInvoiceId: invoiceId,
        confirmedAt: new Date(),
        liquidated: true,
      },
    })
    paymentTransactionId = payment.id

    await tx.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        paidFromAccountId: input.accountId,
      },
    })
  })

  if (paymentTransactionId) {
    await createInvoiceEvent({
      familyId,
      creditCardId: cardId,
      invoiceId,
      actorUserId: userId,
      action: 'PAYMENT_CREATED',
      transactionId: paymentTransactionId,
      payloadAfter: {
        amount: amountToPay,
        accountId: input.accountId,
      },
    })
  }

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
          creditCardId: cardId,
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
  await createInvoiceEvent({
    familyId,
    creditCardId: cardId,
    invoiceId,
    actorUserId: userId,
    action: 'SETTLEMENT_CREATED',
    reason: downPayment > 0 ? 'Negociação com entrada' : 'Negociação sem entrada',
    payloadAfter: {
      settlementId: settlement.id,
      downPayment,
      negotiatedTotal,
      installmentCount: input.installmentCount,
      installmentAmount: input.installmentAmount,
      firstInstallmentMonth: input.firstInstallmentMonth,
      firstInstallmentYear: input.firstInstallmentYear,
    },
  })

  return prisma.creditCardInvoiceSettlement.findUniqueOrThrow({
    where: { id: settlement.id },
    include: {
      installments: { orderBy: { sequence: 'asc' } },
    },
  })
}

export async function closeInvoiceManual(
  familyId: string,
  userId: string,
  cardId: string,
  invoiceId: string,
  input: CloseInvoiceManualInput,
) {
  const { card, line } = await getLedgerLineOrThrow(familyId, cardId, invoiceId)
  if (line.status === 'PAID') {
    throw Object.assign(new Error('Fatura já está quitada'), { statusCode: 409 })
  }
  if (line.status === 'RENEGOTIATED') {
    throw Object.assign(new Error('Fatura renegociada não pode ser fechada manualmente'), { statusCode: 409 })
  }

  const closingDate = getOfficialClosingDate(
    line.referenceMonth,
    line.referenceYear,
    card.closingDay,
    card.dueDay,
  )
  const now = new Date()
  const isBeforeClosingDate = now < closingDate
  if (isBeforeClosingDate && !input.reason) {
    throw Object.assign(
      new Error('Motivo é obrigatório ao fechar fatura antes da data oficial de fechamento'),
      { statusCode: 400 },
    )
  }

  const invoiceBefore = await prisma.creditCardInvoice.findFirst({
    where: { id: invoiceId, creditCardId: cardId },
    select: {
      id: true,
      status: true,
      manualClosedAt: true,
      manualReopenedAt: true,
    },
  })
  if (!invoiceBefore) throw Object.assign(new Error('Fatura não encontrada'), { statusCode: 404 })

  await prisma.creditCardInvoice.update({
    where: { id: invoiceId },
    data: {
      manualClosedAt: now,
      manualReopenedAt: null,
      status: 'CLOSED',
    },
  })

  await createInvoiceEvent({
    familyId,
    creditCardId: cardId,
    invoiceId,
    actorUserId: userId,
    action: 'MANUAL_CLOSE',
    reason: input.reason ?? null,
    payloadBefore: {
      id: invoiceBefore.id,
      status: invoiceBefore.status,
      manualClosedAt: invoiceBefore.manualClosedAt?.toISOString() ?? null,
      manualReopenedAt: invoiceBefore.manualReopenedAt?.toISOString() ?? null,
    },
    payloadAfter: { status: 'CLOSED', manualClosedAt: now.toISOString(), manualReopenedAt: null },
    metadata: {
      isBeforeClosingDate,
      officialClosingDate: closingDate.toISOString(),
    },
  })

  await reconcileInvoiceStatesForCard(card.id, card.closingDay, card.dueDay)
  return getInvoiceStatement(familyId, cardId, invoiceId)
}

export async function reopenInvoice(
  familyId: string,
  userId: string,
  cardId: string,
  invoiceId: string,
  input: ReopenInvoiceInput,
) {
  const { card, line } = await getLedgerLineOrThrow(familyId, cardId, invoiceId)
  const reopenedAt = new Date()
  if (!canReopenInvoice(line.status)) {
    throw Object.assign(new Error('Status da fatura não permite reabertura'), { statusCode: 409 })
  }

  const invoiceBefore = await prisma.creditCardInvoice.findFirst({
    where: { id: invoiceId, creditCardId: cardId },
    select: {
      id: true,
      status: true,
      manualClosedAt: true,
      manualReopenedAt: true,
      renegotiatedAt: true,
    },
  })
  if (!invoiceBefore) throw Object.assign(new Error('Fatura não encontrada'), { statusCode: 404 })

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (line.status === 'RENEGOTIATED') {
      const activeSettlement = await tx.creditCardInvoiceSettlement.findFirst({
        where: { invoiceId, status: 'ACTIVE' },
        include: {
          installments: true,
        },
      })
      if (!activeSettlement) {
        throw Object.assign(new Error('Fatura renegociada sem negociação ativa para reabrir'), {
          statusCode: 409,
        })
      }

      const hasPaidInstallment = activeSettlement.installments.some((installment) => installment.status === 'PAID')
      if (hasPaidInstallment) {
        throw Object.assign(
          new Error('Não é possível reabrir fatura renegociada com parcelas já pagas'),
          { statusCode: 409 },
        )
      }

      await tx.creditCardInvoiceSettlementInstallment.updateMany({
        where: { settlementId: activeSettlement.id, status: { not: 'PAID' } },
        data: { status: 'CANCELLED' },
      })
      await tx.creditCardInvoiceSettlement.update({
        where: { id: activeSettlement.id },
        data: { status: 'CANCELLED' },
      })
    }

    await tx.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        manualClosedAt: null,
        manualReopenedAt: reopenedAt,
        status: 'OPEN',
        renegotiatedAt: null,
      },
    })
  })

  await createInvoiceEvent({
    familyId,
    creditCardId: cardId,
    invoiceId,
    actorUserId: userId,
    action: 'MANUAL_REOPEN',
    reason: input.reason,
    payloadBefore: {
      id: invoiceBefore.id,
      status: invoiceBefore.status,
      manualClosedAt: invoiceBefore.manualClosedAt?.toISOString() ?? null,
      manualReopenedAt: invoiceBefore.manualReopenedAt?.toISOString() ?? null,
      renegotiatedAt: invoiceBefore.renegotiatedAt?.toISOString() ?? null,
    },
    payloadAfter: {
      status: 'OPEN',
      manualClosedAt: null,
      manualReopenedAt: reopenedAt.toISOString(),
      renegotiatedAt: null,
    },
  })

  await ensureInvoiceRowsForCreditCardFromActivity(card.id, card.closingDay, card.dueDay)
  await reconcileInvoiceStatesForCard(card.id, card.closingDay, card.dueDay)
  return getInvoiceStatement(familyId, cardId, invoiceId)
}
