import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('./prisma.js', () => ({
  prisma: {
    creditCardInvoice: {
      findMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    creditCardInvoiceSettlementInstallment: {
      findMany: vi.fn(),
    },
    creditCardInvoiceSettlement: {
      findMany: vi.fn(),
    },
    transaction: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('./credit-card-spending.js', () => ({
  netCardSpendingInPeriod: vi.fn(),
}))

import { prisma } from './prisma.js'
import { netCardSpendingInPeriod } from './credit-card-spending.js'
import { reconcileInvoiceStatesForCard } from './credit-card-invoices-sync.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reconcileInvoiceStatesForCard', () => {
  it('carrega saldo pendente para o ciclo seguinte', async () => {
    vi.mocked(prisma.creditCardInvoice.findMany).mockResolvedValue([
      {
        id: 'inv-jan',
        creditCardId: 'card-1',
        referenceMonth: 1,
        referenceYear: 2026,
        totalAmount: new Decimal(0),
        status: 'OPEN',
        paidAt: null,
        paidFromAccountId: null,
        renegotiatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'inv-fev',
        creditCardId: 'card-1',
        referenceMonth: 2,
        referenceYear: 2026,
        totalAmount: new Decimal(0),
        status: 'OPEN',
        paidAt: null,
        paidFromAccountId: null,
        renegotiatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)
    vi.mocked(prisma.creditCardInvoiceSettlementInstallment.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.creditCardInvoiceSettlement.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
      { creditCardInvoiceId: 'inv-jan', _sum: { amount: new Decimal(40) } },
    ] as never)
    vi.mocked(netCardSpendingInPeriod)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(50)
    vi.mocked(prisma.creditCardInvoice.update).mockResolvedValue({} as never)

    const lines = await reconcileInvoiceStatesForCard('card-1', 20, 10, new Date('2026-03-15T00:00:00Z'))

    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      invoiceId: 'inv-jan',
      cycleAmount: 100,
      paymentAmount: 40,
      outstandingAmount: 60,
    })
    expect(lines[1]).toMatchObject({
      invoiceId: 'inv-fev',
      carriedAmount: 60,
      cycleAmount: 50,
      totalAmount: 110,
      outstandingAmount: 110,
    })
  })

  it('não carrega saldo de fatura renegociada e marca status RENEGOTIATED', async () => {
    vi.mocked(prisma.creditCardInvoice.findMany).mockResolvedValue([
      {
        id: 'inv-jan',
        creditCardId: 'card-1',
        referenceMonth: 1,
        referenceYear: 2026,
        totalAmount: new Decimal(0),
        status: 'OPEN',
        paidAt: null,
        paidFromAccountId: null,
        renegotiatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'inv-fev',
        creditCardId: 'card-1',
        referenceMonth: 2,
        referenceYear: 2026,
        totalAmount: new Decimal(0),
        status: 'OPEN',
        paidAt: null,
        paidFromAccountId: null,
        renegotiatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)
    vi.mocked(prisma.creditCardInvoiceSettlementInstallment.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.creditCardInvoiceSettlement.findMany).mockResolvedValue([
      { invoiceId: 'inv-jan' },
    ] as never)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)
    vi.mocked(netCardSpendingInPeriod)
      .mockResolvedValueOnce(300)
      .mockResolvedValueOnce(80)
    vi.mocked(prisma.creditCardInvoice.update).mockResolvedValue({} as never)

    const lines = await reconcileInvoiceStatesForCard('card-1', 20, 10, new Date('2026-02-25T00:00:00Z'))

    expect(lines[0].status).toBe('RENEGOTIATED')
    expect(lines[0].outstandingAmount).toBe(0)
    expect(lines[1].carriedAmount).toBe(0)
    expect(lines[1].totalAmount).toBe(80)
  })

  it('inclui parcelas negociadas no mês de referência correto', async () => {
    vi.mocked(prisma.creditCardInvoice.findMany).mockResolvedValue([
      {
        id: 'inv-mar',
        creditCardId: 'card-1',
        referenceMonth: 3,
        referenceYear: 2026,
        totalAmount: new Decimal(0),
        status: 'OPEN',
        paidAt: null,
        paidFromAccountId: null,
        renegotiatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)
    vi.mocked(prisma.creditCardInvoiceSettlementInstallment.findMany).mockResolvedValue([
      { amount: new Decimal(123.45), dueReferenceMonth: 3, dueReferenceYear: 2026 },
    ] as never)
    vi.mocked(prisma.creditCardInvoiceSettlement.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)
    vi.mocked(netCardSpendingInPeriod).mockResolvedValueOnce(200)
    vi.mocked(prisma.creditCardInvoice.update).mockResolvedValue({} as never)

    const lines = await reconcileInvoiceStatesForCard('card-1', 20, 10, new Date('2026-03-05T00:00:00Z'))

    expect(lines[0].negotiatedInstallmentAmount).toBeCloseTo(123.45, 2)
    expect(lines[0].totalAmount).toBeCloseTo(323.45, 2)
  })
})
