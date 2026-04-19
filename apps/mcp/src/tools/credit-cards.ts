import { wireTransactionDate } from '@financas/shared-types'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'
import { withMcpToolOAuth } from '../mcp-scopes.js'
import { dueInvoiceKeyForPurchaseDate, purchaseCycleBoundsUtc } from '@financas/shared-types'
import { closeInvoiceManual, payInvoice } from '@financas/api/credit-cards/service'
import { closeInvoiceManualSchema, payInvoiceSchema } from '@financas/api/credit-cards/schema'

const payCreditCardInvoiceArgsSchema = z
  .object({
    creditCardId: z.string().min(1),
    invoiceId: z.string().min(1),
  })
  .merge(payInvoiceSchema)

const closeCreditCardInvoiceArgsSchema = z
  .object({
    creditCardId: z.string().min(1),
    invoiceId: z.string().min(1),
  })
  .merge(closeInvoiceManualSchema)

const creditCardToolDefinitionsBase = [
  {
    name: 'list_credit_cards',
    description:
      'Lista os cartões de crédito da família com status da fatura cujo vencimento cai no ciclo atual (mês de vencimento).',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_invoice',
    description:
      'Retorna a fatura de um cartão por mês/ano de VENCIMENTO (como no extrato), com lançamentos do ciclo dessa fatura.',
    inputSchema: {
      type: 'object' as const,
      required: ['creditCardId'],
      properties: {
        creditCardId: { type: 'string', description: 'ID do cartão de crédito' },
        month: {
          type: 'number',
          description: 'Mês de vencimento da fatura (1-12). Padrão: mês atual',
        },
        year: {
          type: 'number',
          description: 'Ano do vencimento. Padrão: ano atual',
        },
      },
    },
  },
  {
    name: 'pay_credit_card_invoice',
    description:
      'Registra o pagamento de uma fatura de cartão a partir de uma conta à ordem da família. Opcionalmente informe amount para pagamento parcial (até o saldo em aberto); sem amount, usa o valor total em aberto.',
    inputSchema: {
      type: 'object' as const,
      required: ['creditCardId', 'invoiceId', 'accountId'],
      properties: {
        creditCardId: { type: 'string', description: 'ID do cartão de crédito' },
        invoiceId: { type: 'string', description: 'ID da fatura (credit card invoice)' },
        accountId: {
          type: 'string',
          description: 'ID da conta de onde sai o pagamento (conta âncora ou conta à ordem)',
        },
        amount: {
          type: 'number',
          description:
            'Valor a pagar (opcional). Se omitido, paga o saldo total em aberto da fatura. Para parcial, não pode exceder o saldo.',
        },
      },
    },
  },
  {
    name: 'close_credit_card_invoice',
    description:
      'Fecha manualmente a fatura do cartão no sistema. Se o fechamento for antes da data oficial de fechamento do ciclo, informe reason (ao menos 5 caracteres); na janela oficial após essa data, reason é opcional.',
    inputSchema: {
      type: 'object' as const,
      required: ['creditCardId', 'invoiceId'],
      properties: {
        creditCardId: { type: 'string', description: 'ID do cartão de crédito' },
        invoiceId: { type: 'string', description: 'ID da fatura (credit card invoice)' },
        reason: {
          type: 'string',
          description:
            'Motivo do fechamento manual (5–500 caracteres). Obrigatório ao antecipar antes da data oficial de fechamento.',
        },
      },
    },
  },
]

export const creditCardToolDefinitions = creditCardToolDefinitionsBase.map((t) => withMcpToolOAuth(t))

export function registerCreditCardHandlers(
  getContext: () => McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  toolHandlerMap.set('list_credit_cards', async (_args) => {
    const { familyId } = getContext()
    const cards = await prisma.creditCard.findMany({
      where: { familyId, isActive: true },
      include: {
        defaultAccount: { select: { id: true, name: true } },
        invoices: {
          select: { id: true, referenceMonth: true, referenceYear: true, totalAmount: true, status: true, paidAt: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const now = new Date()

    return {
      creditCards: cards.map((card: (typeof cards)[number]) => {
        let dueKey: { referenceMonth: number; referenceYear: number }
        try {
          dueKey = dueInvoiceKeyForPurchaseDate(now, card.closingDay, card.dueDay)
        } catch {
          dueKey = { referenceMonth: now.getUTCMonth() + 1, referenceYear: now.getUTCFullYear() }
        }
        const currentInvoice = card.invoices.find(
          (inv) => inv.referenceMonth === dueKey.referenceMonth && inv.referenceYear === dueKey.referenceYear,
        )
        return {
          id: card.id,
          name: card.name,
          limit: Number(card.limit),
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          defaultAccountId: card.defaultAccountId,
          defaultAccount: card.defaultAccount,
          color: card.color,
          icon: card.icon,
          currentInvoice: currentInvoice
            ? {
                ...currentInvoice,
                totalAmount: Number(currentInvoice.totalAmount),
              }
            : null,
        }
      }),
    }
  })

  toolHandlerMap.set('get_invoice', async (args) => {
    const { familyId } = getContext()
    const now = new Date()
    const input = z
      .object({
        creditCardId: z.string(),
        month: z.number().int().min(1).max(12).default(now.getMonth() + 1),
        year: z.number().int().default(now.getFullYear()),
      })
      .parse(args)

    const card = await prisma.creditCard.findFirst({
      where: { id: input.creditCardId, familyId },
    })
    if (!card) throw new Error('Cartão não encontrado')

    const invoice = await prisma.creditCardInvoice.findFirst({
      where: {
        creditCardId: input.creditCardId,
        referenceMonth: input.month,
        referenceYear: input.year,
      },
    })

    const bounds = purchaseCycleBoundsUtc(input.year, input.month, card.closingDay, card.dueDay)

    const transactions = await prisma.transaction.findMany({
      where: {
        creditCardId: input.creditCardId,
        date: { gt: bounds.gt, lte: bounds.lte },
        status: { not: 'DELETED' },
      },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })

    const total = transactions.reduce((sum: number, t: (typeof transactions)[number]) => sum + Number(t.amount), 0)

    return {
      card: {
        id: card.id,
        name: card.name,
        limit: Number(card.limit),
        closingDay: card.closingDay,
        dueDay: card.dueDay,
      },
      invoice: invoice
        ? { ...invoice, totalAmount: Number(invoice.totalAmount) }
        : { status: 'OPEN', totalAmount: total },
      period: {
        purchaseCycleFromExclusive: bounds.gt.toISOString().slice(0, 10),
        purchaseCycleToInclusive: bounds.lte.toISOString().slice(0, 10),
      },
      transactions: transactions.map((t: (typeof transactions)[number]) =>
        wireTransactionDate({ ...t, amount: Number(t.amount) }),
      ),
      totalSpent: total,
      availableLimit: Number(card.limit) - total,
    }
  })

  toolHandlerMap.set('pay_credit_card_invoice', async (args) => {
    const ctx = getContext()
    const input = payCreditCardInvoiceArgsSchema.parse(args)
    const { creditCardId, invoiceId, ...payBody } = input
    return payInvoice(ctx.familyId, ctx.userId, creditCardId, invoiceId, payBody)
  })

  toolHandlerMap.set('close_credit_card_invoice', async (args) => {
    const ctx = getContext()
    const input = closeCreditCardInvoiceArgsSchema.parse(args)
    const { creditCardId, invoiceId, ...closeBody } = input
    return closeInvoiceManual(ctx.familyId, ctx.userId, creditCardId, invoiceId, closeBody)
  })
}
