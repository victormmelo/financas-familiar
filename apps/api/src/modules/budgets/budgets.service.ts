import { prisma } from '../../lib/prisma.js'
import type { CreateBudgetInput, UpdateBudgetInput, ListBudgetsInput } from './budgets.schema.js'

async function getSpentAmount(
  familyId: string,
  categoryId: string,
  month: number,
  year: number,
): Promise<{
  grossExpense: number
  expenseReimbursements: number
  spentAmount: number
}> {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  const [grossExpenseAgg, expenseReimbursementsAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        familyId,
        categoryId,
        type: 'EXPENSE',
        nature: 'NORMAL',
        status: 'CONFIRMED',
        recognition: 'OPERATIONAL',
        date: { gte: start, lt: end },
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
        date: { gte: start, lt: end },
        linkedTransaction: {
          categoryId,
          type: 'EXPENSE',
          nature: 'NORMAL',
          status: { not: 'DELETED' },
        },
      },
      _sum: { amount: true },
    }),
  ])

  const grossExpense = grossExpenseAgg._sum.amount?.toNumber() ?? 0
  const expenseReimbursements = expenseReimbursementsAgg._sum.amount?.toNumber() ?? 0

  return {
    grossExpense,
    expenseReimbursements,
    spentAmount: Math.max(grossExpense - expenseReimbursements, 0),
  }
}

export async function listBudgets(familyId: string, query: ListBudgetsInput) {
  const now = new Date()
  const month = query.referenceMonth ?? now.getMonth() + 1
  const year = query.referenceYear ?? now.getFullYear()

  const budgets = await prisma.budget.findMany({
    where: { familyId, referenceMonth: month, referenceYear: year },
    include: { category: { select: { id: true, name: true, type: true, color: true, icon: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return Promise.all(
    budgets.map(async (budget: (typeof budgets)[number]) => {
      const { spentAmount, grossExpense, expenseReimbursements } = await getSpentAmount(
        familyId,
        budget.categoryId,
        month,
        year,
      )
      const limitAmount = budget.limitAmount.toNumber()
      const remainingAmount = Math.max(limitAmount - spentAmount, 0)
      const usagePercent = limitAmount > 0 ? Math.min((spentAmount / limitAmount) * 100, 100) : 0
      return {
        ...budget,
        limitAmount,
        grossExpense,
        expenseReimbursements,
        spentAmount,
        remainingAmount,
        usagePercent: Math.round(usagePercent * 100) / 100,
        isOverBudget: spentAmount > limitAmount,
      }
    }),
  )
}

export async function getBudget(familyId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, familyId },
    include: { category: { select: { id: true, name: true, type: true, color: true, icon: true } } },
  })
  if (!budget) throw Object.assign(new Error('Orçamento não encontrado'), { statusCode: 404 })

  const { spentAmount, grossExpense, expenseReimbursements } = await getSpentAmount(
    familyId,
    budget.categoryId,
    budget.referenceMonth,
    budget.referenceYear,
  )
  const limitAmount = budget.limitAmount.toNumber()
  const remainingAmount = Math.max(limitAmount - spentAmount, 0)
  const usagePercent = limitAmount > 0 ? Math.min((spentAmount / limitAmount) * 100, 100) : 0

  return {
    ...budget,
    limitAmount,
    grossExpense,
    expenseReimbursements,
    spentAmount,
    remainingAmount,
    usagePercent: Math.round(usagePercent * 100) / 100,
    isOverBudget: spentAmount > limitAmount,
  }
}

export async function createBudget(familyId: string, input: CreateBudgetInput) {
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, familyId },
  })
  if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })

  const existing = await prisma.budget.findUnique({
    where: {
      familyId_categoryId_referenceMonth_referenceYear: {
        familyId,
        categoryId: input.categoryId,
        referenceMonth: input.referenceMonth,
        referenceYear: input.referenceYear,
      },
    },
  })
  if (existing) {
    throw Object.assign(
      new Error('Já existe um orçamento para essa categoria nesse mês'),
      { statusCode: 409 },
    )
  }

  return prisma.budget.create({
    data: {
      familyId,
      categoryId: input.categoryId,
      referenceMonth: input.referenceMonth,
      referenceYear: input.referenceYear,
      limitAmount: input.limitAmount,
    },
    include: { category: { select: { id: true, name: true, type: true } } },
  })
}

export async function updateBudget(familyId: string, budgetId: string, input: UpdateBudgetInput) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, familyId } })
  if (!budget) throw Object.assign(new Error('Orçamento não encontrado'), { statusCode: 404 })

  return prisma.budget.update({
    where: { id: budgetId },
    data: { limitAmount: input.limitAmount },
    include: { category: { select: { id: true, name: true, type: true } } },
  })
}

export async function deleteBudget(familyId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, familyId } })
  if (!budget) throw Object.assign(new Error('Orçamento não encontrado'), { statusCode: 404 })
  return prisma.budget.delete({ where: { id: budgetId } })
}
