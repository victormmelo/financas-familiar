import { parsePlainDate } from '@financas/shared-types'
import { Worker } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { redisBullmq } from '../lib/redis.js'
import type { ReportJobData } from './reports.queue.js'

async function generateDRE(familyId: string, params: ReportJobData['params']) {
  const now = new Date()
  const start = params.startDate
    ? parsePlainDate(params.startDate)
    : new Date(now.getFullYear(), now.getMonth(), 1)
  const end = params.endDate ? parsePlainDate(params.endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const transactions = await prisma.transaction.findMany({
    where: {
      familyId,
      status: 'CONFIRMED',
      recognition: 'OPERATIONAL',
      date: { gte: start, lte: end },
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
      linkedTransaction: {
        select: {
          id: true,
          type: true,
          nature: true,
          categoryId: true,
          category: { select: { id: true, name: true, type: true } },
        },
      },
    },
  })

  const expenseByCategory = new Map<string, { categoryId: string | null; name: string; grossExpense: number; expenseReimbursements: number; netExpense: number }>()
  const incomeByCategory = new Map<string, { categoryId: string | null; name: string; grossIncome: number; incomeReversals: number; netIncome: number }>()

  const expenseBucket = (categoryId: string | null, name: string) => {
    const key = categoryId ?? '__sem-categoria__'
    const current = expenseByCategory.get(key) ?? {
      categoryId,
      name,
      grossExpense: 0,
      expenseReimbursements: 0,
      netExpense: 0,
    }
    expenseByCategory.set(key, current)
    return current
  }

  const incomeBucket = (categoryId: string | null, name: string) => {
    const key = categoryId ?? '__sem-categoria__'
    const current = incomeByCategory.get(key) ?? {
      categoryId,
      name,
      grossIncome: 0,
      incomeReversals: 0,
      netIncome: 0,
    }
    incomeByCategory.set(key, current)
    return current
  }

  for (const tx of transactions) {
    const amount = tx.amount.toNumber()

    if (tx.nature === 'NORMAL' && tx.type === 'EXPENSE') {
      const bucket = expenseBucket(tx.categoryId, tx.category?.name ?? 'Sem categoria')
      bucket.grossExpense += amount
      continue
    }

    if (tx.nature === 'NORMAL' && tx.type === 'INCOME') {
      const bucket = incomeBucket(tx.categoryId, tx.category?.name ?? 'Sem categoria')
      bucket.grossIncome += amount
      continue
    }

    if (tx.nature === 'REIMBURSEMENT' && tx.type === 'INCOME' && tx.linkedTransaction?.type === 'EXPENSE') {
      const bucket = expenseBucket(
        tx.linkedTransaction.categoryId,
        tx.linkedTransaction.category?.name ?? 'Sem categoria',
      )
      bucket.expenseReimbursements += amount
      continue
    }

    if (tx.nature === 'REIMBURSEMENT' && tx.type === 'EXPENSE' && tx.linkedTransaction?.type === 'INCOME') {
      const bucket = incomeBucket(
        tx.linkedTransaction.categoryId,
        tx.linkedTransaction.category?.name ?? 'Sem categoria',
      )
      bucket.incomeReversals += amount
    }
  }

  const expenseCategories = Array.from(expenseByCategory.values()).map((row) => ({
    ...row,
    netExpense: row.grossExpense - row.expenseReimbursements,
  }))
  const incomeCategories = Array.from(incomeByCategory.values()).map((row) => ({
    ...row,
    netIncome: row.grossIncome - row.incomeReversals,
  }))

  const grossIncome = incomeCategories.reduce((sum, row) => sum + row.grossIncome, 0)
  const incomeReversals = incomeCategories.reduce((sum, row) => sum + row.incomeReversals, 0)
  const grossExpense = expenseCategories.reduce((sum, row) => sum + row.grossExpense, 0)
  const expenseReimbursements = expenseCategories.reduce((sum, row) => sum + row.expenseReimbursements, 0)
  const netIncome = grossIncome - incomeReversals
  const netExpense = grossExpense - expenseReimbursements

  return {
    period: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
    /** Totais “de relatório”: receita e despesa líquidas (após reembolsos). */
    totalIncome: netIncome,
    totalExpense: netExpense,
    grossIncome,
    grossExpense,
    incomeReversals,
    expenseReimbursements,
    netIncome,
    netExpense,
    netResult: netIncome - netExpense,
    incomeCategories: incomeCategories.sort((a, b) => b.grossIncome - a.grossIncome),
    expenseCategories: expenseCategories.sort((a, b) => b.grossExpense - a.grossExpense),
  }
}

async function generateCashFlow(familyId: string, params: ReportJobData['params']) {
  const year = params.referenceYear ?? new Date().getFullYear()

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const rows = await Promise.all(
    months.map(async (month) => {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 1)

      const baseWhere = {
        familyId,
        status: 'CONFIRMED' as const,
        liquidated: true,
        recognition: 'OPERATIONAL' as const,
        date: { gte: start, lt: end },
      }

      const [grossIncomeAgg, grossExpenseAgg, expenseReimbursementsAgg, incomeReversalsAgg] = await Promise.all([
        prisma.transaction.aggregate({
          where: {
            ...baseWhere,
            type: 'INCOME',
            nature: 'NORMAL',
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            ...baseWhere,
            type: 'EXPENSE',
            nature: 'NORMAL',
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            ...baseWhere,
            type: 'INCOME',
            nature: 'REIMBURSEMENT',
            linkedTransaction: {
              type: 'EXPENSE',
              nature: 'NORMAL',
            },
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            ...baseWhere,
            type: 'EXPENSE',
            nature: 'REIMBURSEMENT',
            linkedTransaction: {
              type: 'INCOME',
              nature: 'NORMAL',
            },
          },
          _sum: { amount: true },
        }),
      ])

      const grossIncome = grossIncomeAgg._sum.amount?.toNumber() ?? 0
      const grossExpense = grossExpenseAgg._sum.amount?.toNumber() ?? 0
      const expenseReimbursements = expenseReimbursementsAgg._sum?.amount?.toNumber() ?? 0
      const incomeReversals = incomeReversalsAgg._sum?.amount?.toNumber() ?? 0
      const netIncome = grossIncome - incomeReversals
      const netExpense = grossExpense - expenseReimbursements

      return {
        month,
        year,
        grossIncome,
        grossExpense,
        expenseReimbursements,
        incomeReversals,
        netIncome,
        netExpense,
        cashIn: grossIncome + expenseReimbursements,
        cashOut: grossExpense + incomeReversals,
        net: netIncome - netExpense,
      }
    }),
  )

  return { year, months: rows }
}

async function generatePatrimony(familyId: string) {
  const accounts = await prisma.account.findMany({
    where: { familyId, isActive: true },
  })

  const rows = await Promise.all(
    accounts.map(async (account: (typeof accounts)[number]) => {
      const result = await prisma.transaction.groupBy({
        by: ['type'],
        where: { accountId: account.id, status: 'CONFIRMED', creditCardId: null },
        _sum: { amount: true },
      })
      const income =
        result.find((r: (typeof result)[number]) => r.type === 'INCOME')?._sum.amount?.toNumber() ?? 0
      const expense =
        result.find((r: (typeof result)[number]) => r.type === 'EXPENSE')?._sum.amount?.toNumber() ?? 0
      const balance = account.initialBalance.toNumber() + income - expense

      return { id: account.id, name: account.name, type: account.type, balance }
    }),
  )

  const total = rows.reduce((sum, a) => sum + a.balance, 0)
  return { accounts: rows, totalPatrimony: total }
}

export const reportsWorker = new Worker<ReportJobData>(
  'reports',
  async (job) => {
    const { reportId, familyId, type, params } = job.data

    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'PROCESSING' },
    })

    let result: unknown
    if (type === 'DRE') result = await generateDRE(familyId, params)
    else if (type === 'CASH_FLOW') result = await generateCashFlow(familyId, params)
    else result = await generatePatrimony(familyId)

    // Store result as JSON in params field (merged with input params)
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'DONE',
        params: { ...params, result } as object,
      },
    })
  },
  { connection: redisBullmq, concurrency: 2 },
)

reportsWorker.on('completed', (job) => {
  console.log(`[ReportsWorker] Relatório ${job.data.reportId} gerado com sucesso`)
})

reportsWorker.on('failed', async (job, err) => {
  console.error(`[ReportsWorker] Falha ao gerar relatório ${job?.data.reportId}:`, err.message)
  if (job?.data.reportId) {
    await prisma.report.update({
      where: { id: job.data.reportId },
      data: { status: 'FAILED', errorMsg: err.message },
    })
  }
})
