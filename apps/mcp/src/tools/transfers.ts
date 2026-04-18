import { parsePlainDate } from '@financas/shared-types'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'
import { withMcpToolOAuth } from '../mcp-scopes.js'

const transferToolDefinitionsBase = [
  {
    name: 'create_transfer',
    description:
      'Cria uma transferência entre duas contas da família. Gera dois lançamentos espelhados (débito + crédito) sem afetar o saldo total.',
    inputSchema: {
      type: 'object' as const,
      required: ['fromAccountId', 'toAccountId', 'amount', 'date'],
      properties: {
        fromAccountId: { type: 'string', description: 'ID da conta de origem' },
        toAccountId: { type: 'string', description: 'ID da conta de destino' },
        amount: { type: 'number', description: 'Valor a transferir' },
        date: { type: 'string', description: 'Data da transferência (YYYY-MM-DD)' },
        description: { type: 'string', description: 'Descrição (opcional)' },
      },
    },
  },
]

export const transferToolDefinitions = transferToolDefinitionsBase.map((t) => withMcpToolOAuth(t))

export function registerTransferHandlers(
  getContext: () => McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  toolHandlerMap.set('create_transfer', async (args) => {
    const { familyId, userId } = getContext()
    const input = z
      .object({
        fromAccountId: z.string().uuid(),
        toAccountId: z.string().uuid(),
        amount: z.number().positive(),
        date: z.string(),
        description: z.string().optional(),
      })
      .parse(args)

    if (input.fromAccountId === input.toAccountId) {
      throw new Error('Conta de origem e destino não podem ser iguais')
    }

    const [fromAccount, toAccount] = await Promise.all([
      prisma.account.findFirst({ where: { id: input.fromAccountId, familyId } }),
      prisma.account.findFirst({ where: { id: input.toAccountId, familyId } }),
    ])
    if (!fromAccount) throw new Error('Conta de origem não encontrada')
    if (!toAccount) throw new Error('Conta de destino não encontrada')

    const description = input.description ?? `Transferência: ${fromAccount.name} → ${toAccount.name}`
    const date = parsePlainDate(input.date)

    const transfer = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newTransfer = await tx.transfer.create({
        data: { familyId, fromAccountId: input.fromAccountId, toAccountId: input.toAccountId, amount: input.amount, description, date },
      })

      await tx.transaction.createMany({
        data: [
          {
            familyId,
            accountId: input.fromAccountId,
            createdById: userId,
            type: 'EXPENSE',
            nature: 'TRANSFER',
            status: 'CONFIRMED',
            amount: input.amount,
            description,
            date,
            source: 'MANUAL',
            transferId: newTransfer.id,
            recognition: 'TRANSFER_LEG',
            liquidated: true,
            confirmedAt: new Date(),
          },
          {
            familyId,
            accountId: input.toAccountId,
            createdById: userId,
            type: 'INCOME',
            nature: 'TRANSFER',
            status: 'CONFIRMED',
            amount: input.amount,
            description,
            date,
            source: 'MANUAL',
            transferId: newTransfer.id,
            recognition: 'TRANSFER_LEG',
            liquidated: true,
            confirmedAt: new Date(),
          },
        ],
      })

      return newTransfer
    })

    return {
      transferId: transfer.id,
      from: fromAccount.name,
      to: toAccount.name,
      amount: input.amount,
      date: input.date,
      description,
    }
  })
}
