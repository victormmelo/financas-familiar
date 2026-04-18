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

    const dateFilter = { gte: new Date(startDate), lte: new Date(endDate) }

    const [grossIncomeAgg, grossExpenseAgg, expenseReimbursementsAgg, incomeReversalsAgg, accounts] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          familyId,
          type: 'INCOME',
          nature: 'NORMAL',
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
          nature: 'NORMAL',
          status: 'CONFIRMED',
          recognition: { in: ['OPERATIONAL', 'INVOICE_PAYMENT'] },
          date: dateFilter,
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          familyId,
          type: 'INCOME',
          nature: 'REIMBURSEMENT',
          status: 'CONFIRMED',
          recognition: 'OPERATIONAL',
          date: dateFilter,
          linkedTransaction: {
            type: 'EXPENSE',
            nature: 'NORMAL',
          },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          familyId,
          type: 'EXPENSE',
          nature: 'REIMBURSEMENT',
          status: 'CONFIRMED',
          recognition: 'OPERATIONAL',
          date: dateFilter,
          linkedTransaction: {
            type: 'INCOME',
            nature: 'NORMAL',
          },
        },
        _sum: { amount: true },
      }),
      prisma.account.findMany({
        where: { familyId, isActive: true },
        select: { id: true, name: true, initialBalance: true },
      }),
    ])

    const grossIncome = Number(grossIncomeAgg._sum.amount ?? 0)
    const grossExpense = Number(grossExpenseAgg._sum.amount ?? 0)
    const expenseReimbursements = Number(expenseReimbursementsAgg._sum.amount ?? 0)
    const incomeReversals = Number(incomeReversalsAgg._sum.amount ?? 0)
    const totalIncome = grossIncome - incomeReversals
    const totalExpense = grossExpense - expenseReimbursements

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
        grossIncome,
        grossExpense,
        expenseReimbursements,
        incomeReversals,
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

    const dateFilter = { gte: new Date(startDate), lte: new Date(endDate) }

    const [expenseTransactions, reimbursements] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          familyId,
          type: 'EXPENSE',
          nature: 'NORMAL',
          status: 'CONFIRMED',
          recognition: 'OPERATIONAL',
          date: dateFilter,
        },
        select: { amount: true, categoryId: true, category: { select: { id: true, name: true } } },
      }),
      prisma.transaction.findMany({
        where: {
          familyId,
          type: 'INCOME',
          nature: 'REIMBURSEMENT',
          status: 'CONFIRMED',
          recognition: 'OPERATIONAL',
          date: dateFilter,
          linkedTransaction: {
            type: 'EXPENSE',
            nature: 'NORMAL',
            status: { not: 'DELETED' },
          },
        },
        select: {
          amount: true,
          linkedTransaction: {
            select: { categoryId: true, category: { select: { id: true, name: true } } },
          },
        },
      }),
    ])

    const byCategory = new Map<string, { name: string; grossExpense: number; reimbursements: number; netExpense: number }>()
    let uncategorizedTotal = 0
    let uncategorizedReimbursements = 0

    for (const t of expenseTransactions) {
      const amount = Number(t.amount)
      if (t.categoryId && t.category) {
        const existing = byCategory.get(t.categoryId)
        if (existing) {
          existing.grossExpense += amount
        } else {
          byCategory.set(t.categoryId, { name: t.category.name, grossExpense: amount, reimbursements: 0, netExpense: 0 })
        }
      } else {
        uncategorizedTotal += amount
      }
    }

    for (const tx of reimbursements) {
      const amount = Number(tx.amount)
      const categoryId = tx.linkedTransaction?.categoryId ?? null
      const categoryName = tx.linkedTransaction?.category?.name ?? 'Sem categoria'
      if (categoryId) {
        const existing = byCategory.get(categoryId)
        if (existing) {
          existing.reimbursements += amount
        } else {
          byCategory.set(categoryId, { name: categoryName, grossExpense: 0, reimbursements: amount, netExpense: 0 })
        }
      } else {
        uncategorizedReimbursements += amount
      }
    }

    const totalGrossExpense = expenseTransactions.reduce(
      (sum: number, t: (typeof expenseTransactions)[number]) => sum + Number(t.amount),
      0,
    )
    const totalReimbursements = reimbursements.reduce(
      (sum: number, t: (typeof reimbursements)[number]) => sum + Number(t.amount),
      0,
    )
    const totalExpense = totalGrossExpense - totalReimbursements

    const categories = Array.from(byCategory.entries())
      .map(([id, { name, grossExpense, reimbursements }]) => {
        const netExpense = grossExpense - reimbursements
        return {
        id,
        name,
          grossExpense,
          reimbursements,
          netExpense,
          total: netExpense,
          percentOfTotal: totalExpense > 0 ? Math.round((netExpense / totalExpense) * 100) : 0,
        }
      })
      .sort((a, b) => b.netExpense - a.netExpense)

    const uncategorizedNet = uncategorizedTotal - uncategorizedReimbursements
    if (uncategorizedTotal > 0 || uncategorizedReimbursements > 0) {
      categories.push({
        id: 'uncategorized',
        name: 'Sem categoria',
        grossExpense: uncategorizedTotal,
        reimbursements: uncategorizedReimbursements,
        netExpense: uncategorizedNet,
        total: uncategorizedNet,
        percentOfTotal:
          totalExpense > 0 ? Math.round((uncategorizedNet / totalExpense) * 100) : 0,
      })
    }

    return {
      period: { startDate, endDate },
      totalGrossExpense,
      totalReimbursements,
      totalExpense,
      categories,
    }
  })

  toolHandlerMap.set('get_cashflow', async (args) => {
    const { familyId } = getContext()
    const { startDate, endDate } = z
      .object({ startDate: z.string(), endDate: z.string() })
      .parse(args)

    const start = new Date(startDate)
    const end = new Date(endDate)

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

        const [grossIncomeAgg, grossExpenseAgg, expenseReimbursementsAgg, incomeReversalsAgg] = await Promise.all([
          prisma.transaction.aggregate({
            where: {
              familyId,
              type: 'INCOME',
              nature: 'NORMAL',
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
              nature: 'NORMAL',
              status: 'CONFIRMED',
              liquidated: true,
              recognition: { in: ['OPERATIONAL', 'INVOICE_PAYMENT'] },
              date: dateFilter,
            },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: {
              familyId,
              type: 'INCOME',
              nature: 'REIMBURSEMENT',
              status: 'CONFIRMED',
              liquidated: true,
              recognition: 'OPERATIONAL',
              date: dateFilter,
              linkedTransaction: {
                type: 'EXPENSE',
                nature: 'NORMAL',
              },
            },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: {
              familyId,
              type: 'EXPENSE',
              nature: 'REIMBURSEMENT',
              status: 'CONFIRMED',
              liquidated: true,
              recognition: 'OPERATIONAL',
              date: dateFilter,
              linkedTransaction: {
                type: 'INCOME',
                nature: 'NORMAL',
              },
            },
            _sum: { amount: true },
          }),
        ])

        const grossIncome = Number(grossIncomeAgg._sum.amount ?? 0)
        const grossExpense = Number(grossExpenseAgg._sum.amount ?? 0)
        const expenseReimbursements = Number(expenseReimbursementsAgg._sum.amount ?? 0)
        const incomeReversals = Number(incomeReversalsAgg._sum.amount ?? 0)
        const totalIncome = grossIncome - incomeReversals
        const totalExpense = grossExpense - expenseReimbursements

        return {
          year,
          month,
          label: `${String(month).padStart(2, '0')}/${year}`,
          grossIncome,
          grossExpense,
          expenseReimbursements,
          incomeReversals,
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
