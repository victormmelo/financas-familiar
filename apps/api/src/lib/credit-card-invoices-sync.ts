import { prisma } from './prisma.js'
import { netCardSpendingInPeriod } from './credit-card-spending.js'

/** Desloca mês civil (1–12) no calendário UTC. */
export function shiftCalendarMonthUtc(
  year: number,
  month1to12: number,
  deltaMonths: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month1to12 - 1 + deltaMonths, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

async function calculateInvoiceTotal(cardId: string, month: number, year: number): Promise<number> {
  return netCardSpendingInPeriod(cardId, {
    gte: new Date(year, month - 1, 1),
    lt: new Date(year, month, 1),
  })
}

function closingInstantUtc(referenceYear: number, referenceMonth: number, closingDay: number): Date {
  return new Date(Date.UTC(referenceYear, referenceMonth - 1, closingDay))
}

function dueInstantUtc(referenceYear: number, referenceMonth: number, dueDay: number): Date {
  const dueMonth = referenceMonth === 12 ? 1 : referenceMonth + 1
  const dueYear = referenceMonth === 12 ? referenceYear + 1 : referenceYear
  return new Date(Date.UTC(dueYear, dueMonth - 1, dueDay))
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`
}

export interface InvoiceLedgerLine {
  invoiceId: string
  referenceMonth: number
  referenceYear: number
  cycleAmount: number
  carriedAmount: number
  negotiatedInstallmentAmount: number
  paymentAmount: number
  totalAmount: number
  outstandingAmount: number
  status: 'OPEN' | 'CLOSED' | 'PARTIAL' | 'OVERDUE' | 'RENEGOTIATED' | 'PAID'
  currentPaidAt: Date | null
}

async function ensureInvoiceRowsForMonthKeys(cardId: string, keys: Set<string>) {
  for (const key of keys) {
    const [yStr, mStr] = key.split('-')
    const referenceYear = Number(yStr)
    const referenceMonth = Number(mStr)
    if (!Number.isFinite(referenceYear) || !Number.isFinite(referenceMonth)) continue

    await prisma.creditCardInvoice.upsert({
      where: {
        creditCardId_referenceMonth_referenceYear: {
          creditCardId: cardId,
          referenceMonth,
          referenceYear,
        },
      },
      create: {
        creditCardId: cardId,
        referenceMonth,
        referenceYear,
        totalAmount: 0,
        status: 'OPEN',
      },
      update: {},
    })
  }
}

async function collectSettlementInstallmentsByMonth(cardId: string): Promise<Map<string, number>> {
  const installments = await prisma.creditCardInvoiceSettlementInstallment.findMany({
    where: {
      settlement: { creditCardId: cardId },
      status: { not: 'CANCELLED' },
    },
    select: {
      amount: true,
      dueReferenceMonth: true,
      dueReferenceYear: true,
    },
  })

  const byMonth = new Map<string, number>()
  for (const item of installments) {
    const key = monthKey(item.dueReferenceYear, item.dueReferenceMonth)
    byMonth.set(key, (byMonth.get(key) ?? 0) + item.amount.toNumber())
  }
  return byMonth
}

async function collectSettlementInvoiceIds(cardId: string): Promise<Set<string>> {
  const settlements = await prisma.creditCardInvoiceSettlement.findMany({
    where: { creditCardId: cardId, status: { not: 'CANCELLED' } },
    select: { invoiceId: true },
  })
  return new Set(settlements.map((s) => s.invoiceId))
}

async function collectInvoicePayments(cardId: string): Promise<Map<string, number>> {
  const rows = await prisma.transaction.groupBy({
    by: ['creditCardInvoiceId'],
    where: {
      /** Pagamentos saem da conta corrente: podem não ter `creditCardId` no lançamento; amarramos pela fatura. */
      creditCardInvoice: { creditCardId: cardId },
      creditCardInvoiceId: { not: null },
      recognition: 'INVOICE_PAYMENT',
      status: { not: 'DELETED' },
      liquidated: true,
    },
    _sum: { amount: true },
  })

  const byInvoiceId = new Map<string, number>()
  for (const row of rows) {
    if (!row.creditCardInvoiceId) continue
    byInvoiceId.set(row.creditCardInvoiceId, row._sum.amount?.toNumber() ?? 0)
  }
  return byInvoiceId
}

/**
 * Recalcula o ledger da fatura (valor ciclo, saldo carregado, parcelas negociadas, pagamentos e status).
 */
export async function reconcileInvoiceStatesForCard(
  cardId: string,
  closingDay: number,
  dueDay: number,
  targetDate: Date = new Date(),
): Promise<InvoiceLedgerLine[]> {
  const today = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()),
  )
  const [invoices, installmentsByMonth, settlementInvoiceIds, paymentsByInvoice] = await Promise.all([
    prisma.creditCardInvoice.findMany({
      where: { creditCardId: cardId },
      orderBy: [{ referenceYear: 'asc' }, { referenceMonth: 'asc' }],
    }),
    collectSettlementInstallmentsByMonth(cardId),
    collectSettlementInvoiceIds(cardId),
    collectInvoicePayments(cardId),
  ])

  let carriedFromPrevious = 0
  const lines: InvoiceLedgerLine[] = []

  for (const invoice of invoices) {
    const cycleAmount = await calculateInvoiceTotal(cardId, invoice.referenceMonth, invoice.referenceYear)
    const installmentAmount =
      installmentsByMonth.get(monthKey(invoice.referenceYear, invoice.referenceMonth)) ?? 0
    const paymentAmount = paymentsByInvoice.get(invoice.id) ?? 0
    const totalAmount = carriedFromPrevious + cycleAmount + installmentAmount
    const renegotiated = settlementInvoiceIds.has(invoice.id) || invoice.status === 'RENEGOTIATED'
    const dueDate = dueInstantUtc(invoice.referenceYear, invoice.referenceMonth, dueDay)
    const closingDate = closingInstantUtc(invoice.referenceYear, invoice.referenceMonth, closingDay)
    const manuallyReopened =
      !!invoice.manualReopenedAt &&
      (!invoice.manualClosedAt || invoice.manualReopenedAt > invoice.manualClosedAt)

    let status: InvoiceLedgerLine['status']
    let outstandingAmount = 0

    if (renegotiated) {
      status = 'RENEGOTIATED'
      outstandingAmount = 0
      carriedFromPrevious = 0
    } else {
      outstandingAmount = Math.max(0, totalAmount - paymentAmount)
      const shouldCarryForward = outstandingAmount > 0 && today > dueDate
      carriedFromPrevious = shouldCarryForward ? outstandingAmount : 0
      if (outstandingAmount <= 0) {
        status = 'PAID'
      } else if (today > dueDate) {
        status = 'OVERDUE'
      } else if (paymentAmount > 0) {
        status = 'PARTIAL'
      } else if (
        (invoice.manualClosedAt && !manuallyReopened) ||
        (today >= closingDate && !manuallyReopened)
      ) {
        status = 'CLOSED'
      } else {
        status = 'OPEN'
      }
    }

    lines.push({
      invoiceId: invoice.id,
      referenceMonth: invoice.referenceMonth,
      referenceYear: invoice.referenceYear,
      cycleAmount,
      carriedAmount: totalAmount - cycleAmount - installmentAmount,
      negotiatedInstallmentAmount: installmentAmount,
      paymentAmount,
      totalAmount,
      outstandingAmount,
      status,
      currentPaidAt: invoice.paidAt,
    })
  }

  await Promise.all(
    lines.map((line) =>
      prisma.creditCardInvoice.update({
        where: { id: line.invoiceId },
        data: {
          totalAmount: line.totalAmount,
          status: line.status,
          ...(line.status === 'RENEGOTIATED'
            ? { renegotiatedAt: new Date() }
            : { renegotiatedAt: null }),
          ...(line.status === 'PAID' && !line.currentPaidAt ? { paidAt: new Date() } : {}),
        },
      }),
    ),
  )

  return lines
}

/**
 * Garante linhas de fatura para meses com movimentação no cartão + mês atual e 2 seguintes,
 * depois reconcilia status/valores (usado na listagem para dados aparecerem sem esperar o job).
 */
export async function ensureInvoiceRowsForCreditCardFromActivity(
  cardId: string,
  closingDay: number,
  dueDay: number,
  targetDate: Date = new Date(),
): Promise<void> {
  const [txs, installments] = await Promise.all([
    prisma.transaction.findMany({
      where: { creditCardId: cardId, status: { not: 'DELETED' } },
      select: { date: true },
    }),
    prisma.creditCardInvoiceSettlementInstallment.findMany({
      where: { settlement: { creditCardId: cardId }, status: { not: 'CANCELLED' } },
      select: { dueReferenceMonth: true, dueReferenceYear: true },
    }),
  ])

  const keys = new Set<string>()
  for (const t of txs) {
    const d = new Date(t.date)
    keys.add(monthKey(d.getFullYear(), d.getMonth() + 1))
  }
  for (const installment of installments) {
    keys.add(monthKey(installment.dueReferenceYear, installment.dueReferenceMonth))
  }

  const todayMonth = targetDate.getUTCMonth() + 1
  const todayYear = targetDate.getUTCFullYear()
  for (let delta = 0; delta <= 2; delta++) {
    const { year, month } = shiftCalendarMonthUtc(todayYear, todayMonth, delta)
    keys.add(monthKey(year, month))
  }

  await ensureInvoiceRowsForMonthKeys(cardId, keys)
  await reconcileInvoiceStatesForCard(cardId, closingDay, dueDay, targetDate)
}

/**
 * Pré-cria uma janela larga de faturas (job diário) e reconcilia.
 */
export async function upsertWideInvoiceWindowForCard(
  cardId: string,
  closingDay: number,
  dueDay: number,
  targetDate: Date,
): Promise<void> {
  const todayMonth = targetDate.getUTCMonth() + 1
  const todayYear = targetDate.getUTCFullYear()
  const keys = new Set<string>()

  for (let delta = -24; delta <= 2; delta++) {
    const { year, month } = shiftCalendarMonthUtc(todayYear, todayMonth, delta)
    keys.add(monthKey(year, month))
  }
  await ensureInvoiceRowsForMonthKeys(cardId, keys)

  await reconcileInvoiceStatesForCard(cardId, closingDay, dueDay, targetDate)
}
