import { prisma } from './prisma.js'
import { netCardSpendingInPeriod } from './credit-card-spending.js'
import {
  dueDateUtc,
  dueInvoiceKeyForPurchaseDate,
  purchaseCycleBoundsUtc,
  shiftCalendarMonthUtc,
} from '@financas/shared-types'

export { shiftCalendarMonthUtc } from '@financas/shared-types'

function monthKey(year: number, month: number): string {
  return `${year}-${month}`
}

export interface InvoiceLedgerLine {
  invoiceId: string
  referenceMonth: number
  referenceYear: number
  /** Fechamento oficial (último closingDay antes do vencimento), UTC */
  officialClosingDate: string
  /** Vencimento (reference = mês de vencimento), UTC */
  dueDate: string
  cycleAmount: number
  carriedAmount: number
  negotiatedInstallmentAmount: number
  paymentAmount: number
  totalAmount: number
  outstandingAmount: number
  status: 'OPEN' | 'CLOSED' | 'PARTIAL' | 'OVERDUE' | 'RENEGOTIATED' | 'PAID'
  currentPaidAt: Date | null
}

async function calculateInvoiceTotal(
  cardId: string,
  referenceMonth: number,
  referenceYear: number,
  closingDay: number,
  dueDay: number,
): Promise<number> {
  const bounds = purchaseCycleBoundsUtc(referenceYear, referenceMonth, closingDay, dueDay)
  return netCardSpendingInPeriod(cardId, { gt: bounds.gt, lte: bounds.lte })
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
    const cycleAmount = await calculateInvoiceTotal(
      cardId,
      invoice.referenceMonth,
      invoice.referenceYear,
      closingDay,
      dueDay,
    )
    const installmentAmount =
      installmentsByMonth.get(monthKey(invoice.referenceYear, invoice.referenceMonth)) ?? 0
    const paymentAmount = paymentsByInvoice.get(invoice.id) ?? 0
    const totalAmount = carriedFromPrevious + cycleAmount + installmentAmount
    const renegotiated = settlementInvoiceIds.has(invoice.id) || invoice.status === 'RENEGOTIATED'

    const bounds = purchaseCycleBoundsUtc(invoice.referenceYear, invoice.referenceMonth, closingDay, dueDay)
    const dueDate = dueDateUtc(invoice.referenceYear, invoice.referenceMonth, dueDay)
    const closingDate = new Date(bounds.lte.getTime())
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

      const closedByRule =
        (!!invoice.manualClosedAt && !manuallyReopened) ||
        (today >= closingDate && !manuallyReopened)

      if (outstandingAmount <= 0) {
        /** PAID só com pagamento registrado ou após vencimento com saldo zero (evita fatura futura vazia como "paga"). */
        if (paymentAmount > 0 || today > dueDate) {
          status = 'PAID'
        } else if (closedByRule) {
          status = 'CLOSED'
        } else {
          status = 'OPEN'
        }
      } else if (today > dueDate) {
        status = 'OVERDUE'
      } else if (paymentAmount > 0) {
        status = 'PARTIAL'
      } else if (closedByRule) {
        status = 'CLOSED'
      } else {
        status = 'OPEN'
      }
    }

    lines.push({
      invoiceId: invoice.id,
      referenceMonth: invoice.referenceMonth,
      referenceYear: invoice.referenceYear,
      officialClosingDate: closingDate.toISOString(),
      dueDate: dueDate.toISOString(),
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
    lines.map((line) => {
      const paidAt =
        line.status !== 'PAID'
          ? null
          : line.paymentAmount > 0
            ? line.currentPaidAt ?? new Date()
            : null

      return prisma.creditCardInvoice.update({
        where: { id: line.invoiceId },
        data: {
          totalAmount: line.totalAmount,
          status: line.status,
          paidAt,
          ...(line.status === 'RENEGOTIATED'
            ? { renegotiatedAt: new Date() }
            : { renegotiatedAt: null }),
        },
      })
    }),
  )

  return lines
}

/**
 * Garante linhas de fatura para ciclos com movimentação + janela de vencimentos,
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
    try {
      const key = dueInvoiceKeyForPurchaseDate(d, closingDay, dueDay)
      keys.add(monthKey(key.referenceYear, key.referenceMonth))
    } catch {
      /* fora da janela — ignorar */
    }
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
