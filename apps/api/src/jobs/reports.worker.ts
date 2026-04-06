import { Worker } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { redisBullmq } from '../lib/redis.js'
import type { ReportJobData } from './reports.queue.js'

async function generateDRE(familyId: string, params: ReportJobData['params']) {
  const now = new Date()
  const start = params.startDate
    ? new Date(params.startDate)
    : new Date(now.getFullYear(), now.getMonth(), 1)
  const end = params.endDate ? new Date(params.endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const transactions = await prisma.transaction.findMany({
    where: {
      familyId,
      status: 'CONFIRMED',
      date: { gte: start, lte: end },
    },
    include: { category: { select: { id: true, name: true, type: true } } },
  })

  const byCategory: Record<string, { name: string; type: string; total: number }> = {}

  for (const tx of transactions) {
    const key = tx.categoryId ?? '__sem-categoria__'
    if (!byCategory[key]) {
      byCategory[key] = {
        name: tx.category?.name ?? 'Sem categoria',
        type: tx.type,
        total: 0,
      }
    }
    byCategory[key].total += tx.type === 'INCOME'
      ? tx.amount.toNumber()
      : -tx.amount.toNumber()
  }

  const totalIncome = transactions
    .filter((t: (typeof transactions)[number]) => t.type === 'INCOME')
    .reduce((sum: number, t: (typeof transactions)[number]) => sum + t.amount.toNumber(), 0)
  const totalExpense = transactions
    .filter((t: (typeof transactions)[number]) => t.type === 'EXPENSE')
    .reduce((sum: number, t: (typeof transactions)[number]) => sum + t.amount.toNumber(), 0)

  return {
    period: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
    totalIncome,
    totalExpense,
    netResult: totalIncome - totalExpense,
    categories: Object.values(byCategory),
  }
}

async function generateCashFlow(familyId: string, params: ReportJobData['params']) {
  const year = params.referenceYear ?? new Date().getFullYear()

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const rows = await Promise.all(
    months.map(async (month) => {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 1)

      const result = await prisma.transaction.groupBy({
        by: ['type'],
        where: { familyId, status: 'CONFIRMED', date: { gte: start, lt: end } },
        _sum: { amount: true },
      })

      const income =
        result.find((r: (typeof result)[number]) => r.type === 'INCOME')?._sum.amount?.toNumber() ?? 0
      const expense =
        result.find((r: (typeof result)[number]) => r.type === 'EXPENSE')?._sum.amount?.toNumber() ?? 0

      return { month, year, income, expense, net: income - expense }
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
