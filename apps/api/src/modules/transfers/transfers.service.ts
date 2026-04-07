import { prisma } from '../../lib/prisma.js'
import type { Prisma } from '@prisma/client'
import type { CreateTransferInput, ListTransfersInput } from './transfers.schema.js'

export async function listTransfers(familyId: string, query: ListTransfersInput) {
  const { page, limit, fromAccountId, toAccountId, startDate, endDate } = query
  const skip = (page - 1) * limit

  const where = {
    familyId,
    ...(fromAccountId && { fromAccountId }),
    ...(toAccountId && { toAccountId }),
    ...(startDate || endDate
      ? {
          date: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
          },
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.transfer.findMany({
      where,
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.transfer.count({ where }),
  ])

  const data = rows.map((t) => ({
    ...t,
    amount: Number(t.amount),
  }))

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
}

export async function createTransfer(familyId: string, userId: string, input: CreateTransferInput) {
  const [fromAccount, toAccount] = await Promise.all([
    prisma.account.findFirst({ where: { id: input.fromAccountId, familyId } }),
    prisma.account.findFirst({ where: { id: input.toAccountId, familyId } }),
  ])

  if (!fromAccount) throw Object.assign(new Error('Conta de origem não encontrada'), { statusCode: 404 })
  if (!toAccount) throw Object.assign(new Error('Conta de destino não encontrada'), { statusCode: 404 })

  const description = input.description ?? `Transferência: ${fromAccount.name} → ${toAccount.name}`
  const date = new Date(input.date)

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const transfer = await tx.transfer.create({
      data: {
        familyId,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: input.amount,
        description,
        date,
      },
    })

    // Create mirrored debit (from) and credit (to) transactions
    await tx.transaction.createMany({
      data: [
        {
          familyId,
          accountId: input.fromAccountId,
          createdById: userId,
          type: 'EXPENSE',
          status: 'CONFIRMED',
          amount: input.amount,
          description,
          date,
          source: 'MANUAL',
          transferId: transfer.id,
          confirmedAt: new Date(),
        },
        {
          familyId,
          accountId: input.toAccountId,
          createdById: userId,
          type: 'INCOME',
          status: 'CONFIRMED',
          amount: input.amount,
          description,
          date,
          source: 'MANUAL',
          transferId: transfer.id,
          confirmedAt: new Date(),
        },
      ],
    })

    return tx.transfer.findUniqueOrThrow({
      where: { id: transfer.id },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
      },
    })
  })
}

export async function deleteTransfer(familyId: string, transferId: string) {
  const transfer = await prisma.transfer.findFirst({ where: { id: transferId, familyId } })
  if (!transfer) throw Object.assign(new Error('Transferência não encontrada'), { statusCode: 404 })

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.transaction.updateMany({
      where: { transferId },
      data: { status: 'DELETED' },
    })
    await tx.transfer.delete({ where: { id: transferId } })
  })
}
