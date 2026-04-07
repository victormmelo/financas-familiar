import { prisma } from '../../lib/prisma.js'
import type { CreateAccountInput, UpdateAccountInput } from './accounts.schema.js'
import { Decimal } from '@prisma/client/runtime/library'

export async function listAccounts(familyId: string) {
  const accounts = await prisma.account.findMany({
    where: { familyId, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  // Calculate current balance for each account
  const accountsWithBalance = await Promise.all(
    accounts.map(async (account: (typeof accounts)[number]) => {
      const balance = await calculateBalance(account.id)
      return { ...account, balance }
    }),
  )

  return accountsWithBalance
}

export async function getAccount(familyId: string, accountId: string) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, familyId },
  })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  const balance = await calculateBalance(accountId)
  return { ...account, balance }
}

export async function calculateBalance(accountId: string): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } })

  const result = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
      accountId,
      status: 'CONFIRMED',
      creditCardId: null, // credit card transactions don't affect balance directly
    },
    _sum: { amount: true },
  })

  let income = new Decimal(0)
  let expense = new Decimal(0)

  for (const row of result) {
    if (row.type === 'INCOME') income = row._sum.amount ?? new Decimal(0)
    if (row.type === 'EXPENSE') expense = row._sum.amount ?? new Decimal(0)
  }

  return account.initialBalance.add(income).sub(expense).toNumber()
}

export async function createAccount(familyId: string, input: CreateAccountInput) {
  return prisma.account.create({
    data: {
      familyId,
      name: input.name,
      type: input.type,
      initialBalance: input.initialBalance,
      color: input.color,
      icon: input.icon,
    },
  })
}

export async function updateAccount(familyId: string, accountId: string, input: UpdateAccountInput) {
  const account = await prisma.account.findFirst({ where: { id: accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  return prisma.account.update({
    where: { id: accountId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  })
}

export async function deleteAccount(familyId: string, accountId: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  const transactionCount = await prisma.transaction.count({ where: { accountId } })
  if (transactionCount > 0) {
    // Soft delete if account has transactions
    return prisma.account.update({ where: { id: accountId }, data: { isActive: false } })
  }

  return prisma.account.delete({ where: { id: accountId } })
}
