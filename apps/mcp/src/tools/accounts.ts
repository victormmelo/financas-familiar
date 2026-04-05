import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'

export const accountToolDefinitions = [
  {
    name: 'list_accounts',
    description:
      'Lista todas as contas bancárias da família com saldo atual calculado (saldo inicial + receitas confirmadas - despesas confirmadas).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeInactive: {
          type: 'boolean',
          description: 'Incluir contas inativas (padrão: false)',
        },
      },
    },
  },
  {
    name: 'get_account_balance',
    description: 'Retorna o saldo detalhado de uma conta específica.',
    inputSchema: {
      type: 'object' as const,
      required: ['accountId'],
      properties: {
        accountId: { type: 'string', description: 'ID da conta' },
      },
    },
  },
]

async function calculateBalance(accountId: string) {
  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({
      where: { accountId, type: 'INCOME', status: 'CONFIRMED' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { accountId, type: 'EXPENSE', status: 'CONFIRMED' },
      _sum: { amount: true },
    }),
  ])
  return {
    confirmedIncome: Number(income._sum.amount ?? 0),
    confirmedExpense: Number(expense._sum.amount ?? 0),
  }
}

export function registerAccountHandlers(
  context: McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  const { familyId } = context

  toolHandlerMap.set('list_accounts', async (args) => {
    const { includeInactive } = z
      .object({ includeInactive: z.boolean().default(false) })
      .parse(args ?? {})

    const accounts = await prisma.account.findMany({
      where: { familyId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    })

    const withBalances = await Promise.all(
      accounts.map(async (account) => {
        const { confirmedIncome, confirmedExpense } = await calculateBalance(account.id)
        const initialBalance = Number(account.initialBalance)
        return {
          id: account.id,
          name: account.name,
          type: account.type,
          isActive: account.isActive,
          color: account.color,
          icon: account.icon,
          initialBalance,
          confirmedIncome,
          confirmedExpense,
          currentBalance: initialBalance + confirmedIncome - confirmedExpense,
        }
      }),
    )

    const totalBalance = withBalances.reduce((sum, a) => sum + a.currentBalance, 0)

    return { accounts: withBalances, totalBalance }
  })

  toolHandlerMap.set('get_account_balance', async (args) => {
    const { accountId } = z.object({ accountId: z.string() }).parse(args)

    const account = await prisma.account.findFirst({ where: { id: accountId, familyId } })
    if (!account) throw new Error('Conta não encontrada')

    const { confirmedIncome, confirmedExpense } = await calculateBalance(accountId)
    const initialBalance = Number(account.initialBalance)

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      initialBalance,
      confirmedIncome,
      confirmedExpense,
      currentBalance: initialBalance + confirmedIncome - confirmedExpense,
    }
  })
}
