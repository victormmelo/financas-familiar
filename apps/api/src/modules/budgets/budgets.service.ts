import { prisma } from '../../lib/prisma.js'
import type { CreateBudgetInput, UpdateBudgetInput, ListBudgetsInput } from './budgets.schema.js'

type BudgetSemaphoreStatus = 'GREEN' | 'YELLOW' | 'RED'

interface BudgetCategoryBreakdown {
  categoryId: string
  categoryName: string
  isFixed: boolean
  budgetLimit: number
  spentAmount: number
  usagePercent: number
  isOverBudget: boolean
}

interface BudgetMonthlySummary {
  referenceMonth: number
  referenceYear: number
  fixedBudget: number
  fixedSpent: number
  discretionaryBudget: number
  discretionarySpent: number
  discretionaryCommitted: number
  daysInMonth: number
  daysElapsed: number
  dailyRate: number
  expectedToDate: number
  variance: number
  projectedMonthEnd: number
  projectedOverrun: number
  status: BudgetSemaphoreStatus
  byCategory: BudgetCategoryBreakdown[]
}

// Spending for a specific category: CONFIRMED by settledAt|date, PENDING by dueDate
async function getSpentAmount(
  familyId: string,
  categoryId: string,
  month: number,
  year: number,
): Promise<number> {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 1)

  // CONFIRMED: use settledAt if set, otherwise use date
  const confirmedResult = await prisma.transaction.aggregate({
    where: {
      familyId,
      categoryId,
      type: 'EXPENSE',
      status: 'CONFIRMED',
      OR: [
        { settledAt: { gte: monthStart, lt: monthEnd }, },
        { settledAt: null, date: { gte: monthStart, lt: monthEnd } },
      ],
    },
    _sum: { amount: true },
  })

  // PENDING: count by dueDate within the month
  const pendingResult = await prisma.transaction.aggregate({
    where: {
      familyId,
      categoryId,
      type: 'EXPENSE',
      status: 'PENDING',
      dueDate: { gte: monthStart, lt: monthEnd },
    },
    _sum: { amount: true },
  })

  return (confirmedResult._sum.amount?.toNumber() ?? 0) + (pendingResult._sum.amount?.toNumber() ?? 0)
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
      const spentAmount = await getSpentAmount(familyId, budget.categoryId, month, year)
      const limitAmount = budget.limitAmount.toNumber()
      const remainingAmount = Math.max(limitAmount - spentAmount, 0)
      const usagePercent = limitAmount > 0 ? Math.min((spentAmount / limitAmount) * 100, 100) : 0
      return {
        ...budget,
        limitAmount,
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

  const spentAmount = await getSpentAmount(
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

export async function getMonthlySummary(
  familyId: string,
  month: number,
  year: number,
): Promise<BudgetMonthlySummary> {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 1)
  const today = new Date()
  const daysInMonth = new Date(year, month, 0).getDate()

  // Days elapsed: capped at daysInMonth; if future month, 0
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const isPastMonth = today.getFullYear() > year || (today.getFullYear() === year && today.getMonth() + 1 > month)
  const daysElapsed = isPastMonth ? daysInMonth : isCurrentMonth ? today.getDate() : 0

  // Fetch all budgets with category for the month
  const budgets = await prisma.budget.findMany({
    where: { familyId, referenceMonth: month, referenceYear: year },
    include: { category: { select: { id: true, name: true, type: true, isFixed: true, color: true } } },
  })

  // Aggregate category IDs by fixed/variable
  const fixedBudgets = budgets.filter((b) => b.category.isFixed)
  const variableBudgets = budgets.filter((b) => !b.category.isFixed)

  const fixedBudgetTotal = fixedBudgets.reduce((s, b) => s + b.limitAmount.toNumber(), 0)
  const discretionaryBudget = variableBudgets.reduce((s, b) => s + b.limitAmount.toNumber(), 0)

  // Fixed: total spending (all statuses count as committed)
  const fixedSpentResult = await prisma.transaction.aggregate({
    where: {
      familyId,
      type: 'EXPENSE',
      status: { in: ['CONFIRMED', 'PENDING'] },
      category: { isFixed: true },
      OR: [
        { status: 'CONFIRMED', settledAt: { gte: monthStart, lt: monthEnd } },
        { status: 'CONFIRMED', settledAt: null, date: { gte: monthStart, lt: monthEnd } },
        { status: 'PENDING', dueDate: { gte: monthStart, lt: monthEnd } },
      ],
    },
    _sum: { amount: true },
  })
  const fixedSpent = fixedSpentResult._sum.amount?.toNumber() ?? 0

  // Variable spending UP TO TODAY (for daily rate comparison)
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const discretionarySpentResult = await prisma.transaction.aggregate({
    where: {
      familyId,
      type: 'EXPENSE',
      category: { isFixed: false },
      OR: [
        { status: 'CONFIRMED', settledAt: { gte: monthStart, lt: todayEnd } },
        { status: 'CONFIRMED', settledAt: null, date: { gte: monthStart, lt: todayEnd } },
        { status: 'PENDING', dueDate: { gte: monthStart, lt: todayEnd } },
      ],
    },
    _sum: { amount: true },
  })
  const discretionarySpent = discretionarySpentResult._sum.amount?.toNumber() ?? 0

  // Variable spending committed for future dates this month (PENDING bills not yet due)
  const discretionaryCommittedResult = await prisma.transaction.aggregate({
    where: {
      familyId,
      type: 'EXPENSE',
      status: 'PENDING',
      category: { isFixed: false },
      dueDate: { gte: todayEnd, lt: monthEnd },
    },
    _sum: { amount: true },
  })
  const discretionaryCommitted = discretionaryCommittedResult._sum.amount?.toNumber() ?? 0

  // Daily rate and projections
  const dailyRate = daysInMonth > 0 ? discretionaryBudget / daysInMonth : 0
  const expectedToDate = dailyRate * daysElapsed
  const variance = expectedToDate - discretionarySpent

  // Projection: linear from current pace + committed future bills
  const projectedFromPace =
    daysElapsed > 0 ? (discretionarySpent / daysElapsed) * daysInMonth : discretionarySpent + discretionaryCommitted
  const projectedMonthEnd = Math.max(projectedFromPace, discretionarySpent + discretionaryCommitted)
  const projectedOverrun = projectedMonthEnd - discretionaryBudget

  // Semaphore
  let status: BudgetSemaphoreStatus
  if (discretionarySpent <= expectedToDate) {
    status = 'GREEN'
  } else if (projectedMonthEnd <= discretionaryBudget) {
    status = 'YELLOW'
  } else {
    status = 'RED'
  }

  // Per-category breakdown for variable budgets
  const byCategory = await Promise.all(
    variableBudgets.map(async (b) => {
      const spent = await getSpentAmount(familyId, b.categoryId, month, year)
      const limit = b.limitAmount.toNumber()
      return {
        categoryId: b.categoryId,
        categoryName: b.category.name,
        isFixed: false,
        budgetLimit: limit,
        spentAmount: spent,
        usagePercent: limit > 0 ? Math.round((spent / limit) * 10000) / 100 : 0,
        isOverBudget: spent > limit,
      }
    }),
  )

  return {
    referenceMonth: month,
    referenceYear: year,
    fixedBudget: fixedBudgetTotal,
    fixedSpent,
    discretionaryBudget,
    discretionarySpent,
    discretionaryCommitted,
    daysInMonth,
    daysElapsed,
    dailyRate: Math.round(dailyRate * 100) / 100,
    expectedToDate: Math.round(expectedToDate * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    projectedMonthEnd: Math.round(projectedMonthEnd * 100) / 100,
    projectedOverrun: Math.round(projectedOverrun * 100) / 100,
    status,
    byCategory: byCategory.sort((a, b) => b.spentAmount - a.spentAmount),
  }
}
