import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    creditCard: {
      findFirst: vi.fn(),
    },
    creditCardInvoice: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    creditCardInvoiceEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    creditCardInvoiceSettlement: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    creditCardInvoiceSettlementInstallment: {
      updateMany: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('../../lib/credit-card-invoices-sync.js', () => ({
  ensureInvoiceRowsForCreditCardFromActivity: vi.fn(),
  reconcileInvoiceStatesForCard: vi.fn(),
}))

import { prisma } from '../../lib/prisma.js'
import { reconcileInvoiceStatesForCard } from '../../lib/credit-card-invoices-sync.js'
import { closeInvoiceManual, reopenInvoice } from './credit-cards.service.js'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
    await callback(prisma)
  })
  vi.mocked(prisma.creditCard.findFirst).mockResolvedValue({
    id: 'card-1',
    familyId: 'family-1',
    name: 'Visa',
    closingDay: 10,
    dueDay: 20,
  } as never)
  vi.mocked(reconcileInvoiceStatesForCard).mockResolvedValue([
    {
      invoiceId: 'inv-1',
      referenceMonth: 1,
      referenceYear: 2026,
      officialClosingDate: new Date('2026-01-10T00:00:00.000Z').toISOString(),
      dueDate: new Date('2026-01-20T00:00:00.000Z').toISOString(),
      cycleAmount: 100,
      carriedAmount: 0,
      negotiatedInstallmentAmount: 0,
      paymentAmount: 0,
      totalAmount: 100,
      outstandingAmount: 100,
      status: 'OPEN',
      currentPaidAt: null,
    },
  ])
  vi.mocked(prisma.creditCardInvoice.findFirst).mockResolvedValue({
    id: 'inv-1',
    creditCardId: 'card-1',
    referenceMonth: 1,
    referenceYear: 2026,
    totalAmount: new Decimal(100),
    status: 'OPEN',
    paidAt: null,
    paidFromAccountId: null,
    manualClosedAt: null,
    manualReopenedAt: null,
    renegotiatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    paidFromAccount: null,
  } as never)
  vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.creditCardInvoiceEvent.findMany).mockResolvedValue([] as never)
})

describe('closeInvoiceManual', () => {
  it('exige motivo ao fechar antes da data oficial', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'))

    await expect(
      closeInvoiceManual('family-1', 'user-1', 'card-1', 'inv-1', {}),
    ).rejects.toMatchObject({ statusCode: 400 })

    vi.useRealTimers()
  })

  it('fecha manualmente após data oficial e registra evento', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-21T12:00:00Z'))

    await closeInvoiceManual('family-1', 'user-1', 'card-1', 'inv-1', {})

    expect(prisma.creditCardInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({ status: 'CLOSED' }),
      }),
    )
    expect(prisma.creditCardInvoiceEvent.create).toHaveBeenCalled()

    vi.useRealTimers()
  })
})

describe('reopenInvoice', () => {
  it('bloqueia reabertura de renegociação com parcela paga', async () => {
    vi.mocked(reconcileInvoiceStatesForCard).mockResolvedValue([
      {
        invoiceId: 'inv-1',
        referenceMonth: 1,
        referenceYear: 2026,
        officialClosingDate: new Date('2026-01-10T00:00:00.000Z').toISOString(),
        dueDate: new Date('2026-01-20T00:00:00.000Z').toISOString(),
        cycleAmount: 100,
        carriedAmount: 0,
        negotiatedInstallmentAmount: 20,
        paymentAmount: 0,
        totalAmount: 120,
        outstandingAmount: 0,
        status: 'RENEGOTIATED',
        currentPaidAt: null,
      },
    ])
    vi.mocked(prisma.creditCardInvoiceSettlement.findFirst).mockResolvedValue({
      id: 'set-1',
      installments: [{ id: 'inst-1', status: 'PAID' }],
    } as never)

    await expect(
      reopenInvoice('family-1', 'user-1', 'card-1', 'inv-1', { reason: 'Correção necessária' }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})
