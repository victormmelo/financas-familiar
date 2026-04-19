import { prisma } from './prisma.js'

/** Intervalo por competência civil (legado) ou por ciclo de fatura (gt/lte). */
export type CardTransactionDateRange =
  | { gte: Date; lt: Date }
  | { gt: Date; lte: Date }

/**
 * Total líquido da fatura no período: despesas no cartão menos créditos (estorno/cashback).
 * Valores negativos após o net viram 0 (crédito a favor fica só nas linhas de transação).
 */
export async function netCardSpendingInPeriod(cardId: string, date: CardTransactionDateRange): Promise<number> {
  const dateWhere =
    'gt' in date ? { gt: date.gt, lte: date.lte } : { gte: date.gte, lt: date.lt }

  const base = {
    creditCardId: cardId,
    status: { not: 'DELETED' as const },
    liquidated: true,
    date: dateWhere,
  }

  const [expenseAgg, incomeAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...base, type: 'EXPENSE' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...base, type: 'INCOME' },
      _sum: { amount: true },
    }),
  ])

  const expenses = expenseAgg._sum.amount?.toNumber() ?? 0
  const credits = incomeAgg._sum.amount?.toNumber() ?? 0
  return Math.max(0, expenses - credits)
}
