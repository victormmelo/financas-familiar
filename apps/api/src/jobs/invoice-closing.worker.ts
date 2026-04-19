import { parsePlainDate } from '@financas/shared-types'
import { Worker, Queue } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { redisBullmq } from '../lib/redis.js'
import { upsertWideInvoiceWindowForCard } from '../lib/credit-card-invoices-sync.js'

interface InvoiceClosingJobData {
  targetDate?: string // ISO date — usa hoje se vazio
}

/**
 * Para cada cartão ativo: pré-cria faturas (últimos 24 meses + próximos 2), fecha OPEN vencidas
 * e atualiza totais das faturas em aberto.
 */
async function processInvoiceClosings(targetDate: Date) {
  const cards = await prisma.creditCard.findMany({
    where: { isActive: true },
    select: { id: true, closingDay: true, dueDay: true },
  })

  for (const card of cards) {
    await upsertWideInvoiceWindowForCard(card.id, card.closingDay, card.dueDay, targetDate)
  }

  return { cards: cards.length }
}

export const invoiceClosingWorker = new Worker<InvoiceClosingJobData>(
  'invoice-closing',
  async (job) => {
    const targetDate = job.data.targetDate ? parsePlainDate(job.data.targetDate) : new Date()
    const result = await processInvoiceClosings(targetDate)
    console.log(
      `[InvoiceClosing] Data: ${targetDate.toISOString().slice(0, 10)} | Cartões processados: ${result.cards}`,
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
