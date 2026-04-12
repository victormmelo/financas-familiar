import { prisma } from '../../lib/prisma.js'
import type { CreateAccountInput, UpdateAccountInput, ListAccountsQueryInput } from './accounts.schema.js'
import { Decimal } from '@prisma/client/runtime/library'

/** Último dia (1–31) do mês (month 1–12), calendário UTC. */
export function lastDayOfMonthUtc(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

/** Data (meio-dia UTC) do último dia do mês, inclusiva para `date <=` em @db.Date. */
export function endOfMonthInclusiveUtc(year: number, month1to12: number): Date {
  const d = lastDayOfMonthUtc(year, month1to12)
  return new Date(Date.UTC(year, month1to12 - 1, d, 12, 0, 0, 0))
}

function dateOnlyUtcIso(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function listAccounts(familyId: string, query?: ListAccountsQueryInput) {
  const accounts = await prisma.account.findMany({
    where: { familyId },
    orderBy: { createdAt: 'asc' },
  })

  const asOfYear = query?.asOfYear
  const asOfMonth = query?.asOfMonth
  const useAsOf = asOfYear !== undefined && asOfMonth !== undefined
  const endOfMonthIso = useAsOf
    ? `${asOfYear}-${String(asOfMonth).padStart(2, '0')}-${String(lastDayOfMonthUtc(asOfYear, asOfMonth)).padStart(2, '0')}`
    : null
  const asOfDate = useAsOf ? endOfMonthInclusiveUtc(asOfYear, asOfMonth) : null

  const filtered = useAsOf
    ? accounts.filter((a) => dateOnlyUtcIso(a.createdAt) <= endOfMonthIso!)
    : accounts

  const accountsWithBalance = await Promise.all(
    filtered.map(async (account: (typeof filtered)[number]) => {
      const balance = useAsOf
        ? await calculateBalanceAsOf(account.id, asOfDate!)
        : await calculateBalance(account.id)
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

async function sumConfirmedNonCardByType(
  accountId: string,
  dateLte?: Date,
): Promise<{ income: Decimal; expense: Decimal }> {
  const result = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
      accountId,
      status: 'CONFIRMED',
      creditCardId: null,
      ...(dateLte ? { date: { lte: dateLte } } : {}),
    },
    _sum: { amount: true },
  })

  let income = new Decimal(0)
  let expense = new Decimal(0)

  for (const row of result) {
    if (row.type === 'INCOME') income = row._sum.amount ?? new Decimal(0)
    if (row.type === 'EXPENSE') expense = row._sum.amount ?? new Decimal(0)
  }

  return { income, expense }
}

export async function calculateBalanceAsOf(accountId: string, asOfInclusive: Date): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
  const { income, expense } = await sumConfirmedNonCardByType(accountId, asOfInclusive)
  return account.initialBalance.add(income).sub(expense).toNumber()
}

export async function calculateBalance(accountId: string): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
  const { income, expense } = await sumConfirmedNonCardByType(accountId)
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
