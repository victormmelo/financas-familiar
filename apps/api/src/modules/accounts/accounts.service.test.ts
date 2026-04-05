import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    account: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      groupBy: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '../../lib/prisma.js'
import {
  listAccounts,
  getAccount,
  calculateBalance,
  createAccount,
  updateAccount,
  deleteAccount,
} from './accounts.service.js'

const mockAccount = {
  id: 'acc-1',
  familyId: 'family-1',
  name: 'Conta Corrente',
  type: 'CHECKING' as const,
  initialBalance: new Decimal(1000),
  color: '#6366f1',
  icon: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('calculateBalance', () => {
  it('deve retornar saldo inicial + receitas - despesas', async () => {
    vi.mocked(prisma.account.findUniqueOrThrow).mockResolvedValue(mockAccount)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
      { type: 'INCOME', _sum: { amount: new Decimal(500) } },
      { type: 'EXPENSE', _sum: { amount: new Decimal(200) } },
    ] as never)

    const balance = await calculateBalance('acc-1')

    expect(balance).toBe(1300) // 1000 + 500 - 200
  })

  it('deve retornar apenas saldo inicial quando não há transações', async () => {
    vi.mocked(prisma.account.findUniqueOrThrow).mockResolvedValue(mockAccount)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([])

    const balance = await calculateBalance('acc-1')

    expect(balance).toBe(1000)
  })

  it('deve retornar saldo negativo quando despesas superam receitas', async () => {
    vi.mocked(prisma.account.findUniqueOrThrow).mockResolvedValue({
      ...mockAccount,
      initialBalance: new Decimal(0),
    })
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
      { type: 'EXPENSE', _sum: { amount: new Decimal(300) } },
    ] as never)

    const balance = await calculateBalance('acc-1')

    expect(balance).toBe(-300)
  })
})

describe('listAccounts', () => {
  it('deve retornar contas com saldo calculado', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([mockAccount])
    vi.mocked(prisma.account.findUniqueOrThrow).mockResolvedValue(mockAccount)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([])

    const accounts = await listAccounts('family-1')

    expect(accounts).toHaveLength(1)
    expect(accounts[0].currentBalance).toBe(1000)
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', isActive: true },
      orderBy: { createdAt: 'asc' },
    })
  })
})

describe('getAccount', () => {
  it('deve retornar conta com saldo quando encontrada', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount)
    vi.mocked(prisma.account.findUniqueOrThrow).mockResolvedValue(mockAccount)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([])

    const account = await getAccount('family-1', 'acc-1')

    expect(account.id).toBe('acc-1')
    expect(account.currentBalance).toBe(1000)
  })

  it('deve lançar 404 quando conta não existe ou não pertence à família', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null)

    await expect(getAccount('family-1', 'acc-inexistente')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('createAccount', () => {
  it('deve criar conta com familyId correto', async () => {
    vi.mocked(prisma.account.create).mockResolvedValue(mockAccount)

    await createAccount('family-1', {
      name: 'Conta Corrente',
      type: 'CHECKING',
      initialBalance: 1000,
    })

    expect(prisma.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ familyId: 'family-1', name: 'Conta Corrente' }),
    })
  })
})

describe('updateAccount', () => {
  it('deve atualizar conta existente da família', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount)
    vi.mocked(prisma.account.update).mockResolvedValue({ ...mockAccount, name: 'Novo Nome' })

    const result = await updateAccount('family-1', 'acc-1', { name: 'Novo Nome' })

    expect(result.name).toBe('Novo Nome')
  })

  it('deve lançar 404 para conta de outra família', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null)

    await expect(updateAccount('family-2', 'acc-1', { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('deleteAccount', () => {
  it('deve fazer soft delete quando conta tem transações', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount)
    vi.mocked(prisma.transaction.count).mockResolvedValue(5)
    vi.mocked(prisma.account.update).mockResolvedValue({ ...mockAccount, isActive: false })

    await deleteAccount('family-1', 'acc-1')

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { isActive: false },
    })
    expect(prisma.account.delete).not.toHaveBeenCalled()
  })

  it('deve deletar fisicamente quando conta não tem transações', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount)
    vi.mocked(prisma.transaction.count).mockResolvedValue(0)
    vi.mocked(prisma.account.delete).mockResolvedValue(mockAccount)

    await deleteAccount('family-1', 'acc-1')

    expect(prisma.account.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } })
  })
})
