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

/**
 * Fecha faturas OPEN após o fechamento e atualiza total das faturas ainda abertas.
 */
export async function reconcileInvoiceStatesForCard(
  cardId: string,
  closingDay: number,
  targetDate: Date = new Date(),
): Promise<void> {
  const today = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()),
  )

  const openInvoices = await prisma.creditCardInvoice.findMany({
    where: { creditCardId: cardId, status: 'OPEN' },
  })

  for (const invoice of openInvoices) {
    const closingDate = closingInstantUtc(invoice.referenceYear, invoice.referenceMonth, closingDay)
    if (today >= closingDate) {
      const total = await calculateInvoiceTotal(cardId, invoice.referenceMonth, invoice.referenceYear)
      await prisma.creditCardInvoice.update({
        where: { id: invoice.id },
        data: { status: 'CLOSED', totalAmount: total },
      })
    }
  }

  const stillOpen = await prisma.creditCardInvoice.findMany({
    where: { creditCardId: cardId, status: 'OPEN' },
  })

  for (const invoice of stillOpen) {
    const total = await calculateInvoiceTotal(cardId, invoice.referenceMonth, invoice.referenceYear)
    await prisma.creditCardInvoice.update({
      where: { id: invoice.id },
      data: { totalAmount: total },
    })
  }
}

/**
 * Garante linhas de fatura para meses com movimentação no cartão + mês atual e 2 seguintes,
 * depois reconcilia status/valores (usado na listagem para dados aparecerem sem esperar o job).
 */
export async function ensureInvoiceRowsForCreditCardFromActivity(
  cardId: string,
  closingDay: number,
  targetDate: Date = new Date(),
): Promise<void> {
  const txs = await prisma.transaction.findMany({
    where: { creditCardId: cardId, status: { not: 'DELETED' } },
    select: { date: true },
  })

  const keys = new Set<string>()
  for (const t of txs) {
    const d = new Date(t.date)
    keys.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
  }

  const todayMonth = targetDate.getUTCMonth() + 1
  const todayYear = targetDate.getUTCFullYear()
  for (let delta = 0; delta <= 2; delta++) {
    const { year, month } = shiftCalendarMonthUtc(todayYear, todayMonth, delta)
    keys.add(`${year}-${month}`)
  }

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

  await reconcileInvoiceStatesForCard(cardId, closingDay, targetDate)
}

/**
 * Pré-cria uma janela larga de faturas (job diário) e reconcilia.
 */
export async function upsertWideInvoiceWindowForCard(
  cardId: string,
  closingDay: number,
  targetDate: Date,
): Promise<void> {
  const todayMonth = targetDate.getUTCMonth() + 1
  const todayYear = targetDate.getUTCFullYear()

  for (let delta = -24; delta <= 2; delta++) {
    const { year, month } = shiftCalendarMonthUtc(todayYear, todayMonth, delta)

    await prisma.creditCardInvoice.upsert({
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
        status: 'OPEN',
      },
      update: {},
    })
  }

  await reconcileInvoiceStatesForCard(cardId, closingDay, targetDate)
}
