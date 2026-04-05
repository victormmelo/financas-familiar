import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from '../../lib/prisma.js'
import {
  listTransactions,
  createTransaction,
  confirmTransaction,
  bulkConfirm,
  updateTransaction,
  deleteTransaction,
} from './transactions.service.js'

const mockTransaction = {
  id: 'tx-1',
  familyId: 'family-1',
  accountId: 'acc-1',
  categoryId: 'cat-1',
  createdById: 'user-1',
  type: 'EXPENSE' as const,
  status: 'DRAFT' as const,
  amount: new Decimal(100),
  description: 'Supermercado',
  notes: null,
  date: new Date('2026-04-01'),
  source: 'MANUAL' as const,
  transferId: null,
  creditCardId: null,
  isRecurring: false,
  rrule: null,
  confirmedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockAccount = { id: 'acc-1', familyId: 'family-1', name: 'Conta Corrente' }
const mockCategory = { id: 'cat-1', familyId: 'family-1', name: 'Alimentação' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listTransactions', () => {
  it('deve retornar lista paginada de transações da família', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([mockTransaction] as never)
    vi.mocked(prisma.transaction.count).mockResolvedValue(1)

    const result = await listTransactions('family-1', { page: 1, limit: 20 })

    expect(result.data).toHaveLength(1)
    expect(result.pagination.total).toBe(1)
    expect(result.pagination.pages).toBe(1)
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'family-1' }),
      }),
    )
  })

  it('deve aplicar filtros de status e tipo corretamente', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([])
    vi.mocked(prisma.transaction.count).mockResolvedValue(0)

    await listTransactions('family-1', { page: 1, limit: 20, status: 'CONFIRMED', type: 'INCOME' })

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CONFIRMED', type: 'INCOME' }),
      }),
    )
  })
})

describe('createTransaction', () => {
  it('deve criar transação com status DRAFT', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue(mockTransaction as never)

    await createTransaction('family-1', 'user-1', {
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      amount: 100,
      description: 'Supermercado',
      date: '2026-04-01',
      source: 'MANUAL',
    })

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', familyId: 'family-1' }),
      }),
    )
  })

  it('deve lançar 404 quando conta não pertence à família', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null)

    await expect(
      createTransaction('family-1', 'user-1', {
        accountId: 'acc-outra-familia',
        type: 'EXPENSE',
        amount: 100,
        description: 'Teste',
        date: '2026-04-01',
        source: 'MANUAL',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deve lançar 404 quando categoria não pertence à família', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

    await expect(
      createTransaction('family-1', 'user-1', {
        accountId: 'acc-1',
        categoryId: 'cat-outra-familia',
        type: 'EXPENSE',
        amount: 100,
        description: 'Teste',
        date: '2026-04-01',
        source: 'MANUAL',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('confirmTransaction', () => {
  it('deve mudar status para CONFIRMED e setar confirmedAt', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(mockTransaction as never)
    vi.mocked(prisma.transaction.update).mockResolvedValue({
      ...mockTransaction,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    } as never)

    await confirmTransaction('family-1', 'tx-1')

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { status: 'CONFIRMED', confirmedAt: expect.any(Date) },
    })
  })

  it('deve lançar 409 para transação já confirmada', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      status: 'CONFIRMED',
    } as never)

    await expect(confirmTransaction('family-1', 'tx-1')).rejects.toMatchObject({ statusCode: 409 })
  })

  it('deve lançar 409 para transação deletada', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      status: 'DELETED',
    } as never)

    await expect(confirmTransaction('family-1', 'tx-1')).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('bulkConfirm', () => {
  it('deve confirmar múltiplas transações da família', async () => {
    vi.mocked(prisma.transaction.updateMany).mockResolvedValue({ count: 3 })

    const result = await bulkConfirm('family-1', { ids: ['tx-1', 'tx-2', 'tx-3'] })

    expect(result.confirmed).toBe(3)
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['tx-1', 'tx-2', 'tx-3'] },
        familyId: 'family-1',
        status: 'DRAFT',
      },
      data: { status: 'CONFIRMED', confirmedAt: expect.any(Date) },
    })
  })
})

describe('deleteTransaction', () => {
  it('deve fazer soft delete (status DELETED)', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(mockTransaction as never)
    vi.mocked(prisma.transaction.update).mockResolvedValue({
      ...mockTransaction,
      status: 'DELETED',
    } as never)

    await deleteTransaction('family-1', 'tx-1')

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { status: 'DELETED' },
    })
  })

  it('deve lançar 404 para transação de outra família', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null)

    await expect(deleteTransaction('family-2', 'tx-1')).rejects.toMatchObject({ statusCode: 404 })
  })
})
