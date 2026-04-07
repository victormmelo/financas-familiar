import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    transfer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
    transaction: {
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../../lib/prisma.js'
import { listTransfers } from './transfers.service.js'

const mockTransferRow = {
  id: 'tr-1',
  familyId: 'family-1',
  fromAccountId: 'acc-from',
  toAccountId: 'acc-to',
  amount: new Decimal(150.5),
  description: 'Teste',
  date: new Date('2026-04-01'),
  createdAt: new Date(),
  updatedAt: new Date(),
  fromAccount: { id: 'acc-from', name: 'Conta A' },
  toAccount: { id: 'acc-to', name: 'Conta B' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listTransfers', () => {
  it('deve retornar lista paginada de transferências da família', async () => {
    vi.mocked(prisma.transfer.findMany).mockResolvedValue([mockTransferRow] as never)
    vi.mocked(prisma.transfer.count).mockResolvedValue(1)

    const result = await listTransfers('family-1', { page: 1, limit: 20 })

    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.amount).toBe(150.5)
    expect(result.pagination.total).toBe(1)
    expect(result.pagination.pages).toBe(1)
    expect(prisma.transfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'family-1' }),
        skip: 0,
        take: 20,
      }),
    )
  })

  it('deve aplicar skip na segunda página', async () => {
    vi.mocked(prisma.transfer.findMany).mockResolvedValue([])
    vi.mocked(prisma.transfer.count).mockResolvedValue(25)

    await listTransfers('family-1', { page: 2, limit: 20 })

    expect(prisma.transfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
      }),
    )
  })

  it('deve aplicar filtro fromAccountId e intervalo de datas', async () => {
    vi.mocked(prisma.transfer.findMany).mockResolvedValue([])
    vi.mocked(prisma.transfer.count).mockResolvedValue(0)

    await listTransfers('family-1', {
      page: 1,
      limit: 20,
      fromAccountId: 'acc-from',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    })

    expect(prisma.transfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyId: 'family-1',
          fromAccountId: 'acc-from',
          date: {
            gte: new Date('2026-04-01'),
            lte: new Date('2026-04-30'),
          },
        }),
      }),
    )
  })

  it('deve aplicar filtro toAccountId', async () => {
    vi.mocked(prisma.transfer.findMany).mockResolvedValue([])
    vi.mocked(prisma.transfer.count).mockResolvedValue(0)

    await listTransfers('family-1', { page: 1, limit: 20, toAccountId: 'acc-to' })

    expect(prisma.transfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          toAccountId: 'acc-to',
        }),
      }),
    )
  })
})
