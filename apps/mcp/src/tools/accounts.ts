import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'
import { withMcpToolOAuth } from '../mcp-scopes.js'

const accountToolDefinitionsBase = [
  {
    name: 'list_accounts',
    description:
      'Lista contas com saldo previsto (CONFIRMED na conta, sem cartão) e saldo liquidado (liquidado=true, sem cartão).',
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
  {
    name: 'create_account',
    description:
      'Cria uma conta bancária (corrente, poupança, etc.) com saldo inicial. Mesmas regras da API POST /accounts.',
    inputSchema: {
      type: 'object' as const,
      required: ['name', 'type'],
      properties: {
        name: { type: 'string', description: 'Nome exibido da conta (ex.: Nubank, Banco X)' },
        type: {
          type: 'string',
          enum: ['CHECKING', 'SAVINGS', 'JOINT', 'INVESTMENT', 'CASH'],
          description: 'Tipo da conta',
        },
        initialBalance: {
          type: 'number',
          description: 'Saldo inicial em reais (padrão: 0)',
        },
        color: { type: 'string', description: 'Cor hex opcional' },
        icon: { type: 'string', description: 'Ícone ou emoji opcional' },
      },
    },
  },
]

export const accountToolDefinitions = accountToolDefinitionsBase.map((t) => withMcpToolOAuth(t))

async function sumProjectedNonCard(accountId: string) {
  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({
      where: { accountId, type: 'INCOME', status: 'CONFIRMED', creditCardId: null },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { accountId, type: 'EXPENSE', status: 'CONFIRMED', creditCardId: null },
      _sum: { amount: true },
    }),
  ])
  return {
    confirmedIncome: Number(income._sum.amount ?? 0),
    confirmedExpense: Number(expense._sum.amount ?? 0),
  }
}

async function sumLiquidatedNonCard(accountId: string) {
  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        accountId,
        type: 'INCOME',
        status: { not: 'DELETED' },
        liquidated: true,
        creditCardId: null,
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        accountId,
        type: 'EXPENSE',
        status: { not: 'DELETED' },
        liquidated: true,
        creditCardId: null,
      },
      _sum: { amount: true },
    }),
  ])
  return {
    liquidatedIncome: Number(income._sum.amount ?? 0),
    liquidatedExpense: Number(expense._sum.amount ?? 0),
  }
}

export function registerAccountHandlers(
  getContext: () => McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  toolHandlerMap.set('list_accounts', async (args) => {
    const { familyId } = getContext()
    const { includeInactive } = z
      .object({ includeInactive: z.boolean().default(false) })
      .parse(args ?? {})

    const accounts = await prisma.account.findMany({
      where: { familyId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    })

    const withBalances = await Promise.all(
      accounts.map(async (account: (typeof accounts)[number]) => {
        const { confirmedIncome, confirmedExpense } = await sumProjectedNonCard(account.id)
        const { liquidatedIncome, liquidatedExpense } = await sumLiquidatedNonCard(account.id)
        const initialBalance = Number(account.initialBalance)
        const projectedBalance = initialBalance + confirmedIncome - confirmedExpense
        const liquidatedBalance = initialBalance + liquidatedIncome - liquidatedExpense
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
          currentBalance: projectedBalance,
          liquidatedBalance,
        }
      }),
    )

    const totalProjected = withBalances.reduce((sum, a) => sum + a.currentBalance, 0)
    const totalLiquidated = withBalances.reduce((sum, a) => sum + a.liquidatedBalance, 0)

    return { accounts: withBalances, totalBalance: totalProjected, totalLiquidatedBalance: totalLiquidated }
  })

  toolHandlerMap.set('get_account_balance', async (args) => {
    const { familyId } = getContext()
    const { accountId } = z.object({ accountId: z.string() }).parse(args)

    const account = await prisma.account.findFirst({ where: { id: accountId, familyId } })
    if (!account) throw new Error('Conta não encontrada')

    const { confirmedIncome, confirmedExpense } = await sumProjectedNonCard(accountId)
    const { liquidatedIncome, liquidatedExpense } = await sumLiquidatedNonCard(accountId)
    const initialBalance = Number(account.initialBalance)

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      initialBalance,
      confirmedIncome,
      confirmedExpense,
      currentBalance: initialBalance + confirmedIncome - confirmedExpense,
      liquidatedIncome,
      liquidatedExpense,
      liquidatedBalance: initialBalance + liquidatedIncome - liquidatedExpense,
    }
  })

  toolHandlerMap.set('create_account', async (args) => {
    const { familyId } = getContext()
    const parsed = z
      .object({
        name: z.string().min(1, 'Nome obrigatório'),
        type: z.enum(['CHECKING', 'SAVINGS', 'JOINT', 'INVESTMENT', 'CASH']),
        initialBalance: z.number().default(0),
        color: z.string().optional(),
        icon: z.string().optional(),
      })
      .parse(args)

    const account = await prisma.account.create({
      data: {
        familyId,
        name: parsed.name,
        type: parsed.type,
        initialBalance: parsed.initialBalance,
        color: parsed.color,
        icon: parsed.icon,
      },
    })

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      initialBalance: Number(account.initialBalance),
      color: account.color,
      icon: account.icon,
      isActive: account.isActive,
    }
  })
}
