import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    transaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    transactionDraft: {
      deleteMany: vi.fn(),
    },
    transfer: {
      delete: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
    creditCard: {
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
  bulkSetCategory,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  permanentlyDeleteTransaction,
  emptyTransactionTrash,
  getReimbursementContext,
  getDashboardSummary,
} from './transactions.service.js'

const mockTransaction = {
  id: 'tx-1',
  familyId: 'family-1',
  accountId: 'acc-1',
  categoryId: 'cat-1',
  createdById: 'user-1',
  type: 'EXPENSE' as const,
  nature: 'NORMAL' as const,
  linkedTransactionId: null,
  status: 'DRAFT' as const,
  amount: new Decimal(100),
  description: 'Supermercado',
  notes: null,
  date: new Date('2026-04-01'),
  source: 'MANUAL' as const,
  transferId: null,
  creditCardId: null,
  recognition: 'OPERATIONAL' as const,
  creditCardInvoiceId: null,
  isRecurring: false,
  rrule: null,
  confirmedAt: null,
  liquidated: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockIncomeTransaction = {
  ...mockTransaction,
  id: 'tx-income-1',
  type: 'INCOME' as const,
}

const mockAccount = { id: 'acc-1', familyId: 'family-1', name: 'Conta Corrente' }
const mockCategory = {
  id: 'cat-1',
  familyId: 'family-1',
  name: 'Alimentação',
  type: 'EXPENSE' as const,
  parentId: null,
  icon: null,
  color: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { subcategories: 0 },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
    await fn(prisma)
  })
  vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)
  vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: new Decimal(0) } } as never)
  vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
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
        where: expect.objectContaining({
          familyId: 'family-1',
          status: { not: 'DELETED' },
        }),
      }),
    )
  })

  it('deve listar apenas lixeira quando status é DELETED', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([])
    vi.mocked(prisma.transaction.count).mockResolvedValue(0)

    await listTransactions('family-1', { page: 1, limit: 20, status: 'DELETED' })

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'family-1', status: 'DELETED' }),
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

  it('deve filtrar por liquidated quando informado', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([])
    vi.mocked(prisma.transaction.count).mockResolvedValue(0)

    await listTransactions('family-1', { page: 1, limit: 20, liquidated: true })

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'family-1', liquidated: true }),
      }),
    )
  })
})

describe('createTransaction', () => {
  it('deve criar transação normal sem reembolso (cenário 1)', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue(mockTransaction as never)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)

    const result = await createTransaction('family-1', 'user-1', {
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      nature: 'NORMAL',
      amount: 100,
      description: 'Despesa normal',
      date: '2026-04-01',
      source: 'MANUAL',
      isRecurring: false,
      confirmed: true,
    })

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nature: 'NORMAL',
          linkedTransactionId: null,
        }),
      }),
    )
    expect(result.reimbursedAmount).toBe(0)
    expect(result.remainingReimbursableAmount).toBe(100)
  })

  it('deve criar transação com status DRAFT', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue(mockTransaction as never)

    await createTransaction('family-1', 'user-1', {
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      nature: 'NORMAL',
      amount: 100,
      description: 'Supermercado',
      date: '2026-04-01',
      source: 'MANUAL',
      isRecurring: false,
      confirmed: false,
    })

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', familyId: 'family-1', liquidated: false }),
      }),
    )
  })

  it('deve criar como CONFIRMED quando confirmed=true', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      ...mockTransaction,
      status: 'CONFIRMED',
    } as never)

    await createTransaction('family-1', 'user-1', {
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      nature: 'NORMAL',
      amount: 100,
      description: 'Supermercado',
      date: '2026-04-01',
      source: 'MANUAL',
      isRecurring: false,
      confirmed: true,
    })

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CONFIRMED',
          confirmedAt: expect.any(Date),
        }),
      }),
    )
  })

  it('deve persistir liquidated quando informado na criação', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue({ ...mockTransaction, liquidated: true } as never)

    await createTransaction('family-1', 'user-1', {
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      nature: 'NORMAL',
      amount: 100,
      description: 'Supermercado',
      date: '2026-04-01',
      source: 'MANUAL',
      isRecurring: false,
      confirmed: false,
      liquidated: true,
    })

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ liquidated: true }),
      }),
    )
  })

  it('deve lançar 404 quando conta não pertence à família', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null)

    await expect(
      createTransaction('family-1', 'user-1', {
        accountId: 'acc-outra-familia',
        type: 'EXPENSE',
        nature: 'NORMAL',
        amount: 100,
        description: 'Teste',
        date: '2026-04-01',
        source: 'MANUAL',
        isRecurring: false,
        confirmed: false,
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
        nature: 'NORMAL',
        amount: 100,
        description: 'Teste',
        date: '2026-04-01',
        source: 'MANUAL',
        isRecurring: false,
        confirmed: false,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deve lançar 422 quando categoria for agrupadora (tem subcategorias)', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      ...mockCategory,
      id: 'cat-pai',
      _count: { subcategories: 2 },
    } as never)

    await expect(
      createTransaction('family-1', 'user-1', {
        accountId: 'acc-1',
        categoryId: 'cat-pai',
        type: 'EXPENSE',
        amount: 100,
        description: 'Teste',
        date: '2026-04-01',
        source: 'MANUAL',
        isRecurring: false,
        confirmed: false,
      }),
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(prisma.transaction.create).not.toHaveBeenCalled()
  })

  it('deve persistir creditCardId quando cartão pertence à família', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.creditCard.findFirst).mockResolvedValue({
      id: 'card-1',
      familyId: 'family-1',
      name: 'Visa',
      defaultAccountId: 'acc-1',
    } as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      ...mockTransaction,
      creditCardId: 'card-1',
    } as never)

    await createTransaction('family-1', 'user-1', {
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      nature: 'NORMAL',
      amount: 100,
      description: 'Compra no cartão',
      date: '2026-04-01',
      source: 'MANUAL',
      isRecurring: false,
      confirmed: false,
      creditCardId: 'card-1',
    })

    expect(prisma.creditCard.findFirst).toHaveBeenCalledWith({
      where: { id: 'card-1', familyId: 'family-1' },
    })
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ creditCardId: 'card-1' }),
      }),
    )
  })

  it('deve usar defaultAccountId do cartão quando accountId omitido', async () => {
    vi.mocked(prisma.creditCard.findFirst).mockResolvedValue({
      id: 'card-1',
      familyId: 'family-1',
      name: 'Visa',
      defaultAccountId: 'acc-2',
    } as never)
    vi.mocked(prisma.account.findFirst).mockResolvedValue({ ...mockAccount, id: 'acc-2' } as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue(mockTransaction as never)

    await createTransaction('family-1', 'user-1', {
      type: 'EXPENSE',
      nature: 'NORMAL',
      amount: 50,
      description: 'Compra no cartão',
      date: '2026-04-01',
      source: 'MANUAL',
      isRecurring: false,
      confirmed: false,
      creditCardId: 'card-1',
    })

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountId: 'acc-2', creditCardId: 'card-1' }),
      }),
    )
  })

  it('deve lançar 400 quando cartão sem conta padrão e accountId omitido', async () => {
    vi.mocked(prisma.creditCard.findFirst).mockResolvedValue({
      id: 'card-1',
      familyId: 'family-1',
      name: 'Visa',
      defaultAccountId: null,
    } as never)

    await expect(
      createTransaction('family-1', 'user-1', {
        type: 'EXPENSE',
        nature: 'NORMAL',
        amount: 50,
        description: 'Compra',
        date: '2026-04-01',
        source: 'MANUAL',
        isRecurring: false,
        confirmed: false,
        creditCardId: 'card-1',
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('deve lançar 404 quando cartão não pertence à família', async () => {
    vi.mocked(prisma.creditCard.findFirst).mockResolvedValue(null)

    await expect(
      createTransaction('family-1', 'user-1', {
        accountId: 'acc-1',
        categoryId: 'cat-1',
        type: 'EXPENSE',
        nature: 'NORMAL',
        amount: 100,
        description: 'Teste',
        date: '2026-04-01',
        source: 'MANUAL',
        isRecurring: false,
        confirmed: false,
        creditCardId: 'card-inexistente',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deve criar reembolso parcial vinculado e herdar categoria da original', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      status: 'CONFIRMED',
      amount: new Decimal(250),
      nature: 'NORMAL',
      categoryId: 'cat-1',
    } as never)
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
      _sum: { amount: new Decimal(100) },
    } as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      ...mockTransaction,
      id: 'tx-reimb-1',
      type: 'INCOME',
      nature: 'REIMBURSEMENT',
      linkedTransactionId: 'tx-1',
      amount: new Decimal(50),
      status: 'CONFIRMED',
      linkedTransaction: { ...mockTransaction, status: 'CONFIRMED', amount: new Decimal(250), nature: 'NORMAL' },
    } as never)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
      { linkedTransactionId: 'tx-reimb-1', _sum: { amount: new Decimal(0) } },
    ] as never)

    const result = await createTransaction('family-1', 'user-1', {
      accountId: 'acc-1',
      type: 'INCOME',
      nature: 'REIMBURSEMENT',
      linkedTransactionId: 'tx-1',
      amount: 50,
      description: 'Reembolso parcial',
      date: '2026-04-10',
      source: 'MANUAL',
      isRecurring: false,
      confirmed: true,
    })

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nature: 'REIMBURSEMENT',
          linkedTransactionId: 'tx-1',
          categoryId: 'cat-1',
        }),
      }),
    )
    expect(result.nature).toBe('REIMBURSEMENT')
    expect(result.linkedTransactionId).toBe('tx-1')
  })

  it('deve bloquear quando soma de reembolsos excede valor original', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      status: 'CONFIRMED',
      amount: new Decimal(100),
      nature: 'NORMAL',
    } as never)
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
      _sum: { amount: new Decimal(80) },
    } as never)

    await expect(
      createTransaction('family-1', 'user-1', {
        accountId: 'acc-1',
        type: 'INCOME',
        nature: 'REIMBURSEMENT',
        linkedTransactionId: 'tx-1',
        amount: 30,
        description: 'Excesso',
        date: '2026-04-11',
        source: 'MANUAL',
        isRecurring: false,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('deve bloquear reembolso com tipo incompatível à transação original', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      status: 'CONFIRMED',
      type: 'EXPENSE',
      nature: 'NORMAL',
    } as never)
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: new Decimal(0) } } as never)

    await expect(
      createTransaction('family-1', 'user-1', {
        accountId: 'acc-1',
        type: 'EXPENSE',
        nature: 'REIMBURSEMENT',
        linkedTransactionId: 'tx-1',
        amount: 10,
        description: 'Tipo inválido',
        date: '2026-04-11',
        source: 'MANUAL',
        isRecurring: false,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('deve bloquear reembolso vinculado a transação inexistente', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null)

    await expect(
      createTransaction('family-1', 'user-1', {
        accountId: 'acc-1',
        type: 'INCOME',
        nature: 'REIMBURSEMENT',
        linkedTransactionId: 'tx-inexistente',
        amount: 10,
        description: 'Inválido',
        date: '2026-04-11',
        source: 'MANUAL',
        isRecurring: false,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deve criar reembolso integral de despesa (cenário 2)', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      id: 'tx-original-integral',
      status: 'CONFIRMED',
      amount: new Decimal(15),
      nature: 'NORMAL',
      categoryId: 'cat-1',
      type: 'EXPENSE',
    } as never)
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: new Decimal(0) } } as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      ...mockIncomeTransaction,
      id: 'tx-r-integral',
      nature: 'REIMBURSEMENT',
      linkedTransactionId: 'tx-original-integral',
      amount: new Decimal(15),
      status: 'CONFIRMED',
      linkedTransaction: {
        ...mockTransaction,
        id: 'tx-original-integral',
        amount: new Decimal(15),
        type: 'EXPENSE',
        nature: 'NORMAL',
      },
    } as never)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)

    const result = await createTransaction('family-1', 'user-1', {
      accountId: 'acc-1',
      type: 'INCOME',
      nature: 'REIMBURSEMENT',
      linkedTransactionId: 'tx-original-integral',
      amount: 15,
      description: 'Reembolso integral',
      date: '2026-04-05',
      source: 'MANUAL',
      isRecurring: false,
      confirmed: true,
    })

    expect(result.type).toBe('INCOME')
    expect(result.nature).toBe('REIMBURSEMENT')
    expect(result.linkedTransactionId).toBe('tx-original-integral')
  })

  it('deve suportar múltiplos reembolsos para a mesma transação (cenário 4)', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      id: 'tx-original-multi',
      status: 'CONFIRMED',
      amount: new Decimal(250),
      nature: 'NORMAL',
      categoryId: 'cat-1',
      type: 'EXPENSE',
    } as never)
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: new Decimal(150) } } as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      ...mockIncomeTransaction,
      id: 'tx-r-multi',
      nature: 'REIMBURSEMENT',
      linkedTransactionId: 'tx-original-multi',
      amount: new Decimal(50),
      status: 'CONFIRMED',
      linkedTransaction: {
        ...mockTransaction,
        id: 'tx-original-multi',
        amount: new Decimal(250),
        type: 'EXPENSE',
        nature: 'NORMAL',
      },
    } as never)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)

    await expect(
      createTransaction('family-1', 'user-1', {
        accountId: 'acc-1',
        type: 'INCOME',
        nature: 'REIMBURSEMENT',
        linkedTransactionId: 'tx-original-multi',
        amount: 50,
        description: 'Reembolso adicional',
        date: '2026-04-12',
        source: 'MANUAL',
        isRecurring: false,
        confirmed: true,
      }),
    ).resolves.toBeDefined()
  })

  it('deve suportar compensação de receita com saída (cenário 6)', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockIncomeTransaction,
      id: 'tx-income-original',
      status: 'CONFIRMED',
      amount: new Decimal(500),
      nature: 'NORMAL',
      categoryId: 'cat-1',
      type: 'INCOME',
    } as never)
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: new Decimal(0) } } as never)
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      ...mockTransaction,
      id: 'tx-income-reversal',
      type: 'EXPENSE',
      nature: 'REIMBURSEMENT',
      linkedTransactionId: 'tx-income-original',
      amount: new Decimal(120),
      status: 'CONFIRMED',
      linkedTransaction: {
        ...mockIncomeTransaction,
        id: 'tx-income-original',
        amount: new Decimal(500),
        type: 'INCOME',
        nature: 'NORMAL',
      },
    } as never)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)

    const result = await createTransaction('family-1', 'user-1', {
      accountId: 'acc-1',
      type: 'EXPENSE',
      nature: 'REIMBURSEMENT',
      linkedTransactionId: 'tx-income-original',
      amount: 120,
      description: 'Compensação de receita',
      date: '2026-04-15',
      source: 'MANUAL',
      isRecurring: false,
      confirmed: true,
    })

    expect(result.type).toBe('EXPENSE')
    expect(result.nature).toBe('REIMBURSEMENT')
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

    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: { status: 'CONFIRMED', confirmedAt: expect.any(Date) },
      }),
    )
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

describe('bulkSetCategory', () => {
  it('deve aplicar categoria a várias transações do mesmo tipo', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      { id: 'tx-1', type: 'EXPENSE' },
      { id: 'tx-2', type: 'EXPENSE' },
    ] as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.transaction.updateMany).mockResolvedValue({ count: 2 })

    const result = await bulkSetCategory('family-1', { ids: ['tx-1', 'tx-2'], categoryId: 'cat-1' })

    expect(result.updated).toBe(2)
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['tx-1', 'tx-2'] },
        familyId: 'family-1',
        status: 'DRAFT',
      },
      data: { categoryId: 'cat-1' },
    })
  })

  it('deve aceitar categoria BOTH para receitas', async () => {
    const bothCat = { ...mockCategory, id: 'cat-both', type: 'BOTH' as const }
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{ id: 'tx-1', type: 'INCOME' }] as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(bothCat as never)
    vi.mocked(prisma.transaction.updateMany).mockResolvedValue({ count: 1 })

    await bulkSetCategory('family-1', { ids: ['tx-1'], categoryId: 'cat-both' })

    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { categoryId: 'cat-both' },
      }),
    )
  })

  it('deve remover categoria quando categoryId é null', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{ id: 'tx-1', type: 'EXPENSE' }] as never)
    vi.mocked(prisma.transaction.updateMany).mockResolvedValue({ count: 1 })

    await bulkSetCategory('family-1', { ids: ['tx-1'], categoryId: null })

    expect(prisma.category.findFirst).not.toHaveBeenCalled()
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { categoryId: null },
      }),
    )
  })

  it('deve deduplicar ids antes de validar', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{ id: 'tx-1', type: 'EXPENSE' }] as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(mockCategory as never)
    vi.mocked(prisma.transaction.updateMany).mockResolvedValue({ count: 1 })

    await bulkSetCategory('family-1', { ids: ['tx-1', 'tx-1'], categoryId: 'cat-1' })

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['tx-1'] },
        }),
      }),
    )
  })

  it('deve lançar 400 quando faltar transação em rascunho', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{ id: 'tx-1', type: 'EXPENSE' }] as never)

    await expect(
      bulkSetCategory('family-1', { ids: ['tx-1', 'tx-2'], categoryId: 'cat-1' }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
  })

  it('deve lançar 400 quando misturar receita e despesa', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      { id: 'tx-1', type: 'EXPENSE' },
      { id: 'tx-2', type: 'INCOME' },
    ] as never)

    await expect(
      bulkSetCategory('family-1', { ids: ['tx-1', 'tx-2'], categoryId: 'cat-1' }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
  })

  it('deve lançar 400 quando categoria for de tipo incompatível', async () => {
    const incomeCat = { ...mockCategory, id: 'cat-inc', type: 'INCOME' as const }
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{ id: 'tx-1', type: 'EXPENSE' }] as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(incomeCat as never)

    await expect(
      bulkSetCategory('family-1', { ids: ['tx-1'], categoryId: 'cat-inc' }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
  })

  it('deve lançar 404 quando categoria não existir na família', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{ id: 'tx-1', type: 'EXPENSE' }] as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

    await expect(
      bulkSetCategory('family-1', { ids: ['tx-1'], categoryId: 'cat-x' }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deve lançar 422 quando categoria for agrupadora', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{ id: 'tx-1', type: 'EXPENSE' }] as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      ...mockCategory,
      id: 'cat-pai',
      _count: { subcategories: 1 },
    } as never)

    await expect(
      bulkSetCategory('family-1', { ids: ['tx-1'], categoryId: 'cat-pai' }),
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
  })
})

describe('updateTransaction', () => {
  it('deve atualizar liquidated', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(mockTransaction as never)
    vi.mocked(prisma.transaction.update).mockResolvedValue({ ...mockTransaction, liquidated: true } as never)

    await updateTransaction('family-1', 'tx-1', { liquidated: true })

    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: expect.objectContaining({ liquidated: true }),
      }),
    )
  })

  it('deve atualizar categoryId quando categoria for folha', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(mockTransaction as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      ...mockCategory,
      id: 'cat-leaf',
      _count: { subcategories: 0 },
    } as never)
    vi.mocked(prisma.transaction.update).mockResolvedValue({
      ...mockTransaction,
      categoryId: 'cat-leaf',
    } as never)

    await updateTransaction('family-1', 'tx-1', { categoryId: 'cat-leaf' })

    expect(prisma.category.findFirst).toHaveBeenCalled()
    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: 'cat-leaf' }),
      }),
    )
  })

  it('deve lançar 422 ao definir categoria agrupadora', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(mockTransaction as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      ...mockCategory,
      id: 'cat-pai',
      _count: { subcategories: 1 },
    } as never)

    await expect(updateTransaction('family-1', 'tx-1', { categoryId: 'cat-pai' })).rejects.toMatchObject({
      statusCode: 422,
    })
    expect(prisma.transaction.update).not.toHaveBeenCalled()
  })

  it('deve bloquear ciclo em vínculo de reembolso', async () => {
    vi.mocked(prisma.transaction.findFirst)
      .mockResolvedValueOnce({
        ...mockTransaction,
        id: 'tx-1',
        nature: 'NORMAL',
        linkedTransactionId: null,
      } as never)
      .mockResolvedValueOnce({
        ...mockTransaction,
        id: 'tx-2',
        type: 'EXPENSE',
        nature: 'NORMAL',
        linkedTransactionId: 'tx-1',
        status: 'CONFIRMED',
      } as never)

    await expect(
      updateTransaction('family-1', 'tx-1', {
        nature: 'REIMBURSEMENT',
        linkedTransactionId: 'tx-2',
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('getReimbursementContext', () => {
  it('deve retornar original com totais reembolsados e saldo', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValueOnce({
      ...mockTransaction,
      id: 'tx-original',
      status: 'CONFIRMED',
      amount: new Decimal(250),
      nature: 'NORMAL',
      account: { id: 'acc-1', name: 'Conta' },
      category: { id: 'cat-1', name: 'Alimentação', type: 'EXPENSE' },
    } as never)
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      {
        ...mockIncomeTransaction,
        id: 'tx-r1',
        nature: 'REIMBURSEMENT',
        linkedTransactionId: 'tx-original',
        amount: new Decimal(100),
        account: { id: 'acc-1', name: 'Conta' },
        category: { id: 'cat-1', name: 'Alimentação', type: 'EXPENSE' },
      },
    ] as never)

    const context = await getReimbursementContext('family-1', 'tx-original')
    expect(context.transaction.reimbursedAmount).toBe(100)
    expect(context.transaction.remainingReimbursableAmount).toBe(150)
    expect(context.suggested.type).toBe('INCOME')
  })
})

describe('updateTransaction reimbursement validations', () => {
  it('deve bloquear quando marcar reembolso sem linkedTransactionId', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValueOnce({
      ...mockIncomeTransaction,
      id: 'tx-income-edit',
      status: 'CONFIRMED',
      nature: 'NORMAL',
      linkedTransactionId: null,
    } as never)

    await expect(
      updateTransaction('family-1', 'tx-income-edit', {
        nature: 'REIMBURSEMENT',
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('deve bloquear quando linkedTransactionId não existe ao marcar reembolso', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValueOnce({
      ...mockIncomeTransaction,
      id: 'tx-income-edit',
      status: 'CONFIRMED',
      nature: 'NORMAL',
      linkedTransactionId: null,
    } as never)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValueOnce(null)

    await expect(
      updateTransaction('family-1', 'tx-income-edit', {
        nature: 'REIMBURSEMENT',
        linkedTransactionId: 'tx-inexistente',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('getDashboardSummary', () => {
  it('deve calcular bruto, compensações e líquido', async () => {
    vi.mocked(prisma.transaction.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(1000) } } as never)
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(700) } } as never)
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(100) } } as never)
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(50) } } as never)

    const summary = await getDashboardSummary('family-1', {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    })

    expect(summary.grossIncome).toBe(1000)
    expect(summary.grossExpense).toBe(700)
    expect(summary.expenseReimbursements).toBe(100)
    expect(summary.incomeReversals).toBe(50)
    expect(summary.netIncome).toBe(950)
    expect(summary.netExpense).toBe(600)
    expect(summary.netResult).toBe(350)
  })
})

describe('listTransactions reimbursements', () => {
  it('deve retornar métricas de reembolso para transação original', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      {
        ...mockTransaction,
        id: 'tx-orig',
        amount: new Decimal(250),
        status: 'CONFIRMED',
        nature: 'NORMAL',
      },
    ] as never)
    vi.mocked(prisma.transaction.count).mockResolvedValue(1)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
      { linkedTransactionId: 'tx-orig', _sum: { amount: new Decimal(100) } },
    ] as never)

    const result = await listTransactions('family-1', { page: 1, limit: 20 })

    expect(result.data[0]?.reimbursedAmount).toBe(100)
    expect(result.data[0]?.remainingReimbursableAmount).toBe(150)
    expect(result.data[0]?.netAmount).toBe(150)
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

describe('restoreTransaction', () => {
  it('deve restaurar para CONFIRMED quando havia confirmedAt', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      status: 'DELETED',
      confirmedAt: new Date('2026-04-02'),
    } as never)
    vi.mocked(prisma.transaction.update).mockResolvedValue({
      ...mockTransaction,
      status: 'CONFIRMED',
    } as never)

    await restoreTransaction('family-1', 'tx-1')

    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: { status: 'CONFIRMED' },
      }),
    )
  })

  it('deve restaurar para DRAFT quando não confirmada', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      status: 'DELETED',
      confirmedAt: null,
    } as never)
    vi.mocked(prisma.transaction.update).mockResolvedValue(mockTransaction as never)

    await restoreTransaction('family-1', 'tx-1')

    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: { status: 'DRAFT' },
      }),
    )
  })

  it('deve lançar 404 quando não está na lixeira', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null)
    await expect(restoreTransaction('family-1', 'tx-x')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('permanentlyDeleteTransaction', () => {
  it('deve apagar draft, transação e não remover transfer se ainda houver pernas', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      status: 'DELETED',
      transferId: 'tr-1',
    } as never)
    vi.mocked(prisma.transactionDraft.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.transaction.delete).mockResolvedValue(mockTransaction as never)
    vi.mocked(prisma.transaction.count).mockResolvedValue(1)

    await permanentlyDeleteTransaction('family-1', 'tx-1')

    expect(prisma.transactionDraft.deleteMany).toHaveBeenCalledWith({ where: { transactionId: 'tx-1' } })
    expect(prisma.transaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-1' } })
    expect(prisma.transfer.delete).not.toHaveBeenCalled()
  })

  it('deve remover transfer quando não restarem transações ligadas', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      ...mockTransaction,
      status: 'DELETED',
      transferId: 'tr-1',
    } as never)
    vi.mocked(prisma.transactionDraft.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.transaction.delete).mockResolvedValue(mockTransaction as never)
    vi.mocked(prisma.transaction.count).mockResolvedValue(0)

    await permanentlyDeleteTransaction('family-1', 'tx-1')

    expect(prisma.transfer.delete).toHaveBeenCalledWith({ where: { id: 'tr-1' } })
  })

  it('deve lançar 404 quando não está na lixeira', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null)
    await expect(permanentlyDeleteTransaction('family-1', 'tx-x')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('emptyTransactionTrash', () => {
  it('deve apagar todas as transações DELETED da família', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{ id: 'tx-a' }, { id: 'tx-b' }] as never)
    vi.mocked(prisma.transaction.findFirst)
      .mockResolvedValueOnce({
        ...mockTransaction,
        id: 'tx-a',
        status: 'DELETED',
        transferId: null,
      } as never)
      .mockResolvedValueOnce({
        ...mockTransaction,
        id: 'tx-b',
        status: 'DELETED',
        transferId: null,
      } as never)
    vi.mocked(prisma.transactionDraft.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.transaction.delete).mockResolvedValue(mockTransaction as never)

    const result = await emptyTransactionTrash('family-1')

    expect(result).toEqual({ deleted: 2 })
    expect(prisma.transaction.delete).toHaveBeenCalledTimes(2)
  })
})
