import { parsePlainDate } from '@financas/shared-types'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'
import { withMcpToolOAuth } from '../mcp-scopes.js'

const reportToolDefinitionsBase = [
  {
    name: 'get_financial_summary',
    description:
      'Resumo financeiro do período: total de receitas, despesas, saldo líquido e saldo atual de todas as contas.',
    inputSchema: {
      type: 'object' as const,
      required: ['startDate', 'endDate'],
      properties: {
        startDate: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
      },
    },
  },
  {
    name: 'get_expenses_by_category',
    description:
      'Gastos agrupados por categoria no período. Mostra quanto foi gasto em cada categoria e o percentual em relação ao total.',
    inputSchema: {
      type: 'object' as const,
      required: ['startDate', 'endDate'],
      properties: {
        startDate: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
      },
    },
  },
  {
    name: 'get_cashflow',
    description:
      'Fluxo de caixa mensal: receitas e despesas mês a mês para um período. Bom para visualizar tendências.',
    inputSchema: {
      type: 'object' as const,
      required: ['startDate', 'endDate'],
      properties: {
        startDate: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
      },
    },
  },
  {
    name: 'trigger_report',
    description:
      'Dispara a geração assíncrona de um relatório completo (DRE, Fluxo de Caixa, Patrimônio). O relatório ficará disponível para download quando pronto.',
    inputSchema: {
      type: 'object' as const,
      required: ['type', 'startDate', 'endDate'],
      properties: {
        type: {
          type: 'string',
          enum: ['DRE', 'CASH_FLOW', 'PATRIMONY'],
          description: 'Tipo: DRE (demonstrativo), CASH_FLOW (fluxo de caixa), PATRIMONY (patrimônio)',
        },
        startDate: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
      },
    },
  },
]

export const reportToolDefinitions = reportToolDefinitionsBase.map((t) => withMcpToolOAuth(t))

export function registerReportHandlers(
  getContext: () => McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  toolHandlerMap.set('get_financial_summary', async (args) => {
    const { familyId } = getContext()
    const { startDate, endDate } = z
      .object({ startDate: z.string(), endDate: z.string() })
      .parse(args)

    const dateFilter = { gte: parsePlainDate(startDate), lte: parsePlainDate(endDate) }

    const [income, expense, accounts] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          familyId,
          type: 'INCOME',
          status: 'CONFIRMED',
          recognition: 'OPERATIONAL',
          date: dateFilter,
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          familyId,
          type: 'EXPENSE',
          status: 'CONFIRMED',
          recognition: { in: ['OPERATIONAL', 'INVOICE_PAYMENT'] },
          date: dateFilter,
        },
        _sum: { amount: true },
      }),
      prisma.account.findMany({
        where: { familyId, isActive: true },
        select: { id: true, name: true, initialBalance: true },
      }),
    ])

    const totalIncome = Number(income._sum.amount ?? 0)
    const totalExpense = Number(expense._sum.amount ?? 0)

    // Saldos das contas (sem filtro de período — saldo atual real)
    const accountBalances = await Promise.all(
      accounts.map(async (account: (typeof accounts)[number]) => {
        const [inc, exp] = await Promise.all([
          prisma.transaction.aggregate({
            where: { accountId: account.id, type: 'INCOME', status: 'CONFIRMED' },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: { accountId: account.id, type: 'EXPENSE', status: 'CONFIRMED' },
            _sum: { amount: true },
          }),
        ])
        const balance =
          Number(account.initialBalance) +
          Number(inc._sum.amount ?? 0) -
          Number(exp._sum.amount ?? 0)
        return { id: account.id, name: account.name, balance }
      }),
    )

    return {
      period: { startDate, endDate },
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      accounts: accountBalances,
      totalCurrentBalance: accountBalances.reduce((sum: number, a: (typeof accountBalances)[number]) => sum + a.balance, 0),
    }
  })

  toolHandlerMap.set('get_expenses_by_category', async (args) => {
    const { familyId } = getContext()
    const { startDate, endDate } = z
      .object({ startDate: z.string(), endDate: z.string() })
      .parse(args)

    const dateFilter = { gte: parsePlainDate(startDate), lte: parsePlainDate(endDate) }

    const transactions = await prisma.transaction.findMany({
      where: {
        familyId,
        type: 'EXPENSE',
        status: 'CONFIRMED',
        recognition: 'OPERATIONAL',
        date: dateFilter,
      },
      select: { amount: true, categoryId: true, category: { select: { id: true, name: true } } },
    })

    const byCategory = new Map<string, { name: string; total: number }>()
    let uncategorizedTotal = 0

    for (const t of transactions) {
      const amount = Number(t.amount)
      if (t.categoryId && t.category) {
        const existing = byCategory.get(t.categoryId)
        if (existing) {
          existing.total += amount
        } else {
          byCategory.set(t.categoryId, { name: t.category.name, total: amount })
        }
      } else {
        uncategorizedTotal += amount
      }
    }

    const totalExpense = transactions.reduce((sum: number, t: (typeof transactions)[number]) => sum + Number(t.amount), 0)

    const categories = Array.from(byCategory.entries())
      .map(([id, { name, total }]) => ({
        id,
        name,
        total,
        percentOfTotal: totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)

    if (uncategorizedTotal > 0) {
      categories.push({
        id: 'uncategorized',
        name: 'Sem categoria',
        total: uncategorizedTotal,
        percentOfTotal:
          totalExpense > 0 ? Math.round((uncategorizedTotal / totalExpense) * 100) : 0,
      })
    }

    return { period: { startDate, endDate }, totalExpense, categories }
  })

  toolHandlerMap.set('get_cashflow', async (args) => {
    const { familyId } = getContext()
    const { startDate, endDate } = z
      .object({ startDate: z.string(), endDate: z.string() })
      .parse(args)

    const start = parsePlainDate(startDate)
    const end = parsePlainDate(endDate)

    const months: { year: number; month: number }[] = []
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur <= end) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
      cur.setMonth(cur.getMonth() + 1)
    }

    const cashflow = await Promise.all(
      months.map(async ({ year, month }) => {
        const from = new Date(year, month - 1, 1)
        const to = new Date(year, month, 0)
        const dateFilter = { gte: from, lte: to }

        const [income, expense] = await Promise.all([
          prisma.transaction.aggregate({
            where: {
              familyId,
              type: 'INCOME',
              status: 'CONFIRMED',
              liquidated: true,
              recognition: 'OPERATIONAL',
              date: dateFilter,
            },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: {
              familyId,
              type: 'EXPENSE',
              status: 'CONFIRMED',
              liquidated: true,
              recognition: { in: ['OPERATIONAL', 'INVOICE_PAYMENT'] },
              date: dateFilter,
            },
            _sum: { amount: true },
          }),
        ])

        const totalIncome = Number(income._sum.amount ?? 0)
        const totalExpense = Number(expense._sum.amount ?? 0)

        return {
          year,
          month,
          label: `${String(month).padStart(2, '0')}/${year}`,
          totalIncome,
          totalExpense,
          netBalance: totalIncome - totalExpense,
        }
      }),
    )

    return { period: { startDate, endDate }, months: cashflow }
  })

  toolHandlerMap.set('trigger_report', async (args) => {
    const { familyId, userId } = getContext()
    const input = z
      .object({
        type: z.enum(['DRE', 'CASH_FLOW', 'PATRIMONY']),
        startDate: z.string(),
        endDate: z.string(),
      })
      .parse(args)

    const report = await prisma.report.create({
      data: {
        familyId,
        type: input.type,
        status: 'PENDING',
        params: { startDate: input.startDate, endDate: input.endDate, requestedBy: userId },
      },
    })

    return {
      reportId: report.id,
      type: report.type,
      status: report.status,
      message: 'Relatório agendado. Consulte o status pelo ID quando pronto.',
    }
  })
}
