import { prisma } from '../../lib/prisma.js'
import { calculateBalance } from '../accounts/accounts.service.js'
import type { CreateGoalInput, UpdateGoalInput } from './goals.schema.js'

function computeProgress(goal: {
  targetAmount: { toNumber(): number }
  currentAmount: { toNumber(): number }
  accountBalance?: number
}) {
  const target = goal.targetAmount.toNumber()
  const current = goal.accountBalance ?? goal.currentAmount.toNumber()
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0
  return { current, target, percentage: Math.round(percentage * 100) / 100 }
}

export async function listGoals(familyId: string) {
  const goals = await prisma.goal.findMany({
    where: { familyId },
    include: { account: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return Promise.all(
    goals.map(async (goal: (typeof goals)[number]) => {
      const accountBalance = goal.accountId
        ? await calculateBalance(goal.accountId)
        : undefined
      const progress = computeProgress({ ...goal, accountBalance })
      return {
        ...goal,
        currentAmount: progress.current,
        targetAmount: progress.target,
        progressPercent: progress.percentage,
      }
    }),
  )
}

export async function getGoal(familyId: string, goalId: string) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, familyId },
    include: { account: { select: { id: true, name: true } } },
  })
  if (!goal) throw Object.assign(new Error('Meta não encontrada'), { statusCode: 404 })

  const accountBalance = goal.accountId ? await calculateBalance(goal.accountId) : undefined
  const progress = computeProgress({ ...goal, accountBalance })
  return {
    ...goal,
    currentAmount: progress.current,
    targetAmount: progress.target,
    progressPercent: progress.percentage,
  }
}

export async function createGoal(familyId: string, input: CreateGoalInput) {
  if (input.accountId) {
    const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
    if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })
  }

  return prisma.goal.create({
    data: {
      familyId,
      name: input.name,
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount,
      deadline: input.deadline ? new Date(input.deadline) : undefined,
      accountId: input.accountId,
      icon: input.icon,
      color: input.color,
    },
    include: { account: { select: { id: true, name: true } } },
  })
}

export async function updateGoal(familyId: string, goalId: string, input: UpdateGoalInput) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, familyId } })
  if (!goal) throw Object.assign(new Error('Meta não encontrada'), { statusCode: 404 })

  if (input.accountId) {
    const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
    if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })
  }

  return prisma.goal.update({
    where: { id: goalId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.targetAmount !== undefined && { targetAmount: input.targetAmount }),
      ...(input.currentAmount !== undefined && { currentAmount: input.currentAmount }),
      ...(input.deadline !== undefined && {
        deadline: input.deadline ? new Date(input.deadline) : null,
      }),
      ...(input.accountId !== undefined && { accountId: input.accountId }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
    },
    include: { account: { select: { id: true, name: true } } },
  })
}

export async function completeGoal(familyId: string, goalId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, familyId } })
  if (!goal) throw Object.assign(new Error('Meta não encontrada'), { statusCode: 404 })
  if (goal.isCompleted)
    throw Object.assign(new Error('Meta já está concluída'), { statusCode: 409 })

  return prisma.goal.update({
    where: { id: goalId },
    data: { isCompleted: true },
  })
}

export async function deleteGoal(familyId: string, goalId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, familyId } })
  if (!goal) throw Object.assign(new Error('Meta não encontrada'), { statusCode: 404 })
  return prisma.goal.delete({ where: { id: goalId } })
}
