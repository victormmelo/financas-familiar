import { Worker, Queue } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { redisBullmq } from '../lib/redis.js'

interface InvoiceClosingJobData {
  targetDate?: string // ISO date — usa hoje se vazio
}

/**
 * Calcula o valor total de uma fatura com base nas transações do cartão no mês de referência.
 * Usa mês calendário (1º ao último dia do mês).
 */
async function calculateInvoiceTotal(cardId: string, month: number, year: number): Promise<number> {
  const result = await prisma.transaction.aggregate({
    where: {
      creditCardId: cardId,
      status: { not: 'DELETED' },
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
    },
    _sum: { amount: true },
  })
  return result._sum.amount?.toNumber() ?? 0
}

/**
 * Para cada cartão ativo, fecha as faturas OPEN cujo dia de fechamento já passou.
 * Também pré-cria faturas dos próximos 2 meses para garantir visibilidade.
 */
async function processInvoiceClosings(targetDate: Date) {
  const today = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()),
  )
  const todayDay = today.getUTCDate()
  const todayMonth = today.getUTCMonth() + 1
  const todayYear = today.getUTCFullYear()

  const cards = await prisma.creditCard.findMany({
    where: { isActive: true },
    select: { id: true, closingDay: true, dueDay: true },
  })

  let closed = 0
  let preCreated = 0

  for (const card of cards) {
    // ─── Fechar faturas OPEN cujo dia de fechamento já passou ────────────────
    const openInvoices = await prisma.creditCardInvoice.findMany({
      where: { creditCardId: card.id, status: 'OPEN' },
    })

    for (const invoice of openInvoices) {
      const closingDate = new Date(Date.UTC(invoice.referenceYear, invoice.referenceMonth - 1, card.closingDay))
      if (today >= closingDate) {
        const total = await calculateInvoiceTotal(card.id, invoice.referenceMonth, invoice.referenceYear)
        await prisma.creditCardInvoice.update({
          where: { id: invoice.id },
          data: { status: 'CLOSED', totalAmount: total },
        })
        closed++
      }
    }

    // ─── Pré-criar faturas dos próximos 2 meses ───────────────────────────
    for (let offset = 0; offset <= 2; offset++) {
      const targetMonth = ((todayMonth - 1 + offset) % 12) + 1
      const targetYear = todayYear + Math.floor((todayMonth - 1 + offset) / 12)

      await prisma.creditCardInvoice.upsert({
        where: {
          creditCardId_referenceMonth_referenceYear: {
            creditCardId: card.id,
            referenceMonth: targetMonth,
            referenceYear: targetYear,
          },
        },
        create: {
          creditCardId: card.id,
          referenceMonth: targetMonth,
          referenceYear: targetYear,
          totalAmount: 0,
          status: 'OPEN',
        },
        update: {},
      })

      // Atualiza o totalAmount da fatura atual (mês corrente)
      if (offset === 0 && todayDay <= card.closingDay) {
        const total = await calculateInvoiceTotal(card.id, targetMonth, targetYear)
        await prisma.creditCardInvoice.update({
          where: {
            creditCardId_referenceMonth_referenceYear: {
              creditCardId: card.id,
              referenceMonth: targetMonth,
              referenceYear: targetYear,
            },
          },
          data: { totalAmount: total },
        })
      }

      preCreated++
    }
  }

  return { cards: cards.length, closed, preCreated }
}

export const invoiceClosingWorker = new Worker<InvoiceClosingJobData>(
  'invoice-closing',
  async (job) => {
    const targetDate = job.data.targetDate ? new Date(job.data.targetDate) : new Date()
    const result = await processInvoiceClosings(targetDate)
    console.log(
      `[InvoiceClosing] Data: ${targetDate.toISOString().slice(0, 10)} | Cartões: ${result.cards} | Fechadas: ${result.closed} | Pré-criadas: ${result.preCreated}`,
    )
    return result
  },
  { connection: redisBullmq, concurrency: 1 },
)

invoiceClosingWorker.on('completed', (job) => {
  console.log(`[InvoiceClosing] Job ${job.id} concluído`)
})

invoiceClosingWorker.on('failed', (job, err) => {
  console.error(`[InvoiceClosing] Job ${job?.id} falhou:`, err.message)
})

// ─── Scheduler diário ────────────────────────────────────────────────────────
const schedulerQueue = new Queue<InvoiceClosingJobData>('invoice-closing', {
  connection: redisBullmq,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  },
})

schedulerQueue
  .upsertJobScheduler(
    'daily-invoice-closing',
    { pattern: '0 1 * * *' }, // todo dia às 01:00 UTC (após o worker de recorrência)
    { name: 'invoice-closing', data: {} },
  )
  .catch((err) => {
    console.error('[InvoiceClosing] Falha ao registrar job scheduler:', err.message)
  })
