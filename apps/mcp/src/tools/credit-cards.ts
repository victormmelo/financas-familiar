import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'

export const creditCardToolDefinitions = [
  {
    name: 'list_credit_cards',
    description: 'Lista os cartões de crédito da família com status da fatura do mês atual.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_invoice',
    description:
      'Retorna a fatura de um cartão de crédito em um mês/ano específico, com todas as transações.',
    inputSchema: {
      type: 'object' as const,
      required: ['creditCardId'],
      properties: {
        creditCardId: { type: 'string', description: 'ID do cartão de crédito' },
        month: {
          type: 'number',
          description: 'Mês (1-12). Padrão: mês atual',
        },
        year: {
          type: 'number',
          description: 'Ano. Padrão: ano atual',
        },
      },
    },
  },
]

export function registerCreditCardHandlers(
  context: McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  const { familyId } = context

  toolHandlerMap.set('list_credit_cards', async (_args) => {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const cards = await prisma.creditCard.findMany({
      where: { familyId, isActive: true },
      include: {
        invoices: {
          where: { referenceMonth: month, referenceYear: year },
          select: { id: true, totalAmount: true, status: true, paidAt: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return {
      creditCards: cards.map((card: (typeof cards)[number]) => ({
        id: card.id,
        name: card.name,
        limit: Number(card.limit),
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        color: card.color,
        icon: card.icon,
        currentInvoice: card.invoices[0]
          ? {
              ...card.invoices[0],
              totalAmount: Number(card.invoices[0].totalAmount),
            }
          : null,
      })),
    }
  })

  toolHandlerMap.set('get_invoice', async (args) => {
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

    // Busca transações do cartão no período da fatura
    const startDate = new Date(input.year, input.month - 1, card.closingDay + 1)
    startDate.setMonth(startDate.getMonth() - 1)
    const endDate = new Date(input.year, input.month - 1, card.closingDay)

    const transactions = await prisma.transaction.findMany({
      where: {
        creditCardId: input.creditCardId,
        date: { gte: startDate, lte: endDate },
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
      period: { from: startDate.toISOString().slice(0, 10), to: endDate.toISOString().slice(0, 10) },
      transactions: transactions.map((t: (typeof transactions)[number]) => ({ ...t, amount: Number(t.amount) })),
      totalSpent: total,
      availableLimit: Number(card.limit) - total,
    }
  })
}
