import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'

export const budgetToolDefinitions = [
  {
    name: 'get_budget_status',
    description:
      'Retorna o status dos orçamentos mensais por categoria: quanto foi orçado, quanto já foi gasto e o percentual utilizado. Útil para saber se está dentro do orçamento.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        month: { type: 'number', description: 'Mês (1-12). Padrão: mês atual' },
        year: { type: 'number', description: 'Ano. Padrão: ano atual' },
      },
    },
  },
]

export function registerBudgetHandlers(
  context: McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  const { familyId } = context

  toolHandlerMap.set('get_budget_status', async (args) => {
    const now = new Date()
    const input = z
      .object({
        month: z.number().int().min(1).max(12).default(now.getMonth() + 1),
        year: z.number().int().default(now.getFullYear()),
      })
      .parse(args ?? {})

    const budgets = await prisma.budget.findMany({
      where: { familyId, referenceMonth: input.month, referenceYear: input.year },
      include: {
        category: { select: { id: true, name: true, type: true, icon: true } },
      },
    })

    const startOfMonth = new Date(input.year, input.month - 1, 1)
    const endOfMonth = new Date(input.year, input.month, 0)

    const statusList = await Promise.all(
      budgets.map(async (budget: (typeof budgets)[number]) => {
        const spent = await prisma.transaction.aggregate({
          where: {
            familyId,
            categoryId: budget.categoryId,
            type: 'EXPENSE',
            status: 'CONFIRMED',
            recognition: 'OPERATIONAL',
            date: { gte: startOfMonth, lte: endOfMonth },
          },
          _sum: { amount: true },
        })

        const limit = Number(budget.limitAmount)
        const spentAmount = Number(spent._sum.amount ?? 0)
        const percentUsed = limit > 0 ? Math.round((spentAmount / limit) * 100) : 0
        const remaining = Math.max(0, limit - spentAmount)
        const isAlert = percentUsed >= 80

        return {
          budgetId: budget.id,
          category: budget.category,
          limit,
          spent: spentAmount,
          remaining,
          percentUsed,
          isAlert,
          isOverBudget: spentAmount > limit,
        }
      }),
    )

    const totalLimit = statusList.reduce((sum, b) => sum + b.limit, 0)
    const totalSpent = statusList.reduce((sum, b) => sum + b.spent, 0)

    return {
      period: { month: input.month, year: input.year },
      budgets: statusList.sort((a, b) => b.percentUsed - a.percentUsed),
      summary: {
        totalLimit,
        totalSpent,
        totalRemaining: Math.max(0, totalLimit - totalSpent),
        overallPercent: totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0,
      },
    }
  })
}
