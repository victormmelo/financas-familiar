import { prisma } from './prisma.js'

export interface CardTransactionDateRange {
  gte: Date
  lt: Date
}

/**
 * Total líquido da fatura no período: despesas no cartão menos créditos (estorno/cashback).
 * Valores negativos após o net viram 0 (crédito a favor fica só nas linhas de transação).
 */
export async function netCardSpendingInPeriod(cardId: string, date: CardTransactionDateRange): Promise<number> {
  const base = {
    creditCardId: cardId,
    status: { not: 'DELETED' as const },
    liquidated: true,
    date,
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
