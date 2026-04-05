import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    budget: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
    transaction: {
      aggregate: vi.fn(),
    },
  },
}))

import { prisma } from '../../lib/prisma.js'
import { listBudgets, getBudget, createBudget, updateBudget, deleteBudget } from './budgets.service.js'

const mockCategory = {
  id: 'cat-1',
  name: 'Alimentação',
  type: 'EXPENSE',
  color: '#f59e0b',
  icon: null,
}

const mockBudget = {
  id: 'budget-1',
  familyId: 'family-1',
  categoryId: 'cat-1',
  referenceMonth: 4,
  referenceYear: 2026,
  limitAmount: new Decimal(500),
  createdAt: new Date(),
  updatedAt: new Date(),
  category: mockCategory,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listBudgets', () => {
  it('deve retornar orçamentos com campos de consumo calculados', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([mockBudget])
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
      _sum: { amount: new Decimal(200) },
    } as never)

    const budgets = await listBudgets('family-1', { referenceMonth: 4, referenceYear: 2026 })

    expect(budgets).toHaveLength(1)
    expect(budgets[0].spentAmount).toBe(200)
    expect(budgets[0].limitAmount).toBe(500)
    expect(budgets[0].remainingAmount).toBe(300)
    expect(budgets[0].usagePercent).toBe(40)
    expect(budgets[0].isOverBudget).toBe(false)
  })

  it('deve indicar isOverBudget=true quando gasto supera limite', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([mockBudget])
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
      _sum: { amount: new Decimal(600) },
    } as never)

    const budgets = await listBudgets('family-1', { referenceMonth: 4, referenceYear: 2026 })

    expect(budgets[0].isOverBudget).toBe(true)
    expect(budgets[0].usagePercent).toBe(100) // capped at 100
    expect(budgets[0].remainingAmount).toBe(0) // não pode ser negativo
  })

  it('deve usar mês atual quando query não fornece referência', async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([])
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: null } } as never)

    await listBudgets('family-1', {})

    const now = new Date()
    expect(prisma.budget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          referenceMonth: now.getMonth() + 1,
          referenceYear: now.getFullYear(),
        }),
      }),
    )
  })
})

describe('getBudget', () => {
  it('deve retornar orçamento com detalhes calculados', async () => {
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(mockBudget)
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
      _sum: { amount: new Decimal(250) },
    } as never)

    const budget = await getBudget('family-1', 'budget-1')

    expect(budget.spentAmount).toBe(250)
    expect(budget.usagePercent).toBe(50)
  })

  it('deve lançar 404 para orçamento de outra família', async () => {
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(null)

    await expect(getBudget('family-2', 'budget-1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('createBudget', () => {
  it('deve criar orçamento quando categoria existe na família', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.budget.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.budget.create).mockResolvedValue(mockBudget)

    await createBudget('family-1', {
      categoryId: 'cat-1',
      referenceMonth: 4,
      referenceYear: 2026,
      limitAmount: 500,
    })

    expect(prisma.budget.create).toHaveBeenCalledOnce()
  })

  it('deve lançar 404 quando categoria não existe na família', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

    await expect(
      createBudget('family-1', {
        categoryId: 'cat-inexistente',
        referenceMonth: 4,
        referenceYear: 2026,
        limitAmount: 500,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deve lançar 409 quando orçamento duplicado para mesmo mês/categoria', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.budget.findUnique).mockResolvedValue(mockBudget)

    await expect(
      createBudget('family-1', {
        categoryId: 'cat-1',
        referenceMonth: 4,
        referenceYear: 2026,
        limitAmount: 500,
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('deleteBudget', () => {
  it('deve deletar orçamento existente da família', async () => {
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(mockBudget)
    vi.mocked(prisma.budget.delete).mockResolvedValue(mockBudget)

    await deleteBudget('family-1', 'budget-1')

    expect(prisma.budget.delete).toHaveBeenCalledWith({ where: { id: 'budget-1' } })
  })
})
