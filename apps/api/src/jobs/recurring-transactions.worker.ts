import { Worker, Queue } from 'bullmq'
import { RRule } from 'rrule'
import { prisma } from '../lib/prisma.js'
import { redisBullmq } from '../lib/redis.js'
import type { RecurringTransactionsJobData } from './recurring-transactions.queue.js'

const LOOKAHEAD_DAYS = 90

/**
 * Gera ocorrências de recorrências para um intervalo de datas.
 * Idempotente: checa existência antes de criar (familyId + accountId + description + date + source).
 */
export async function generateOccurrences(fromDate: Date, toDate: Date) {
  const from = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()),
  )
  const to = new Date(
    Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate(), 23, 59, 59),
  )

  // Busca todas as transações recorrentes confirmadas com rrule
  const templates = await prisma.transaction.findMany({
    where: {
      isRecurring: true,
      rrule: { not: null },
      status: 'CONFIRMED',
    },
    select: {
      id: true,
      familyId: true,
      accountId: true,
      categoryId: true,
      createdById: true,
      type: true,
      amount: true,
      description: true,
      notes: true,
      rrule: true,
      source: true,
      creditCardId: true,
      nature: true,
      linkedTransactionId: true,
    },
  })

  let created = 0
  let skipped = 0

  for (const template of templates) {
    let rule: RRule
    try {
      rule = RRule.fromString(template.rrule!)
    } catch {
      console.warn(`[RecurringWorker] rrule inválida na transação ${template.id}: ${template.rrule}`)
      continue
    }

    const occurrences = rule.between(from, to, true)
    if (occurrences.length === 0) {
      skipped++
      continue
    }

    for (const occurrenceDate of occurrences) {
      const targetDateOnly = new Date(
        Date.UTC(occurrenceDate.getUTCFullYear(), occurrenceDate.getUTCMonth(), occurrenceDate.getUTCDate()),
      )

      // Idempotência: checa se já existe draft/confirmed para essa data
      const existing = await prisma.transaction.findFirst({
        where: {
          familyId: template.familyId,
          accountId: template.accountId,
          description: template.description,
          date: targetDateOnly,
          source: template.source,
          status: { in: ['DRAFT', 'CONFIRMED'] },
          recurringTemplateId: template.id,
        },
      })

      if (existing) {
        skipped++
        continue
      }

      await prisma.transaction.create({
        data: {
          familyId: template.familyId,
          accountId: template.accountId,
          categoryId: template.categoryId,
          createdById: template.createdById,
          type: template.type,
          nature: template.nature,
          linkedTransactionId: template.linkedTransactionId,
          status: 'DRAFT',
          amount: template.amount,
          description: template.description,
          notes: template.notes,
          date: targetDateOnly,
          source: template.source,
          creditCardId: template.creditCardId,
          isRecurring: false,
          recurringTemplateId: template.id,
        },
      })

      created++
    }
  }

  return { templates: templates.length, created, skipped }
}

export const recurringTransactionsWorker = new Worker<RecurringTransactionsJobData>(
  'recurring-transactions',
  async (job) => {
    // Se targetDate fornecido, usa como ponto de partida; senão usa hoje
    const startDate = job.data.targetDate ? new Date(job.data.targetDate) : new Date()
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + LOOKAHEAD_DAYS)

    const result = await generateOccurrences(startDate, endDate)
    console.log(
      `[RecurringWorker] De: ${startDate.toISOString().slice(0, 10)} até ${endDate.toISOString().slice(0, 10)} | Templates: ${result.templates} | Criados: ${result.created} | Ignorados: ${result.skipped}`,
    )
    return result
  },
  { connection: redisBullmq, concurrency: 1 },
)

recurringTransactionsWorker.on('completed', (job) => {
  console.log(`[RecurringWorker] Job ${job.id} concluído`)
})

recurringTransactionsWorker.on('failed', (job, err) => {
  console.error(`[RecurringWorker] Job ${job?.id} falhou:`, err.message)
})

// ─── Scheduler diário ────────────────────────────────────────────────────────
// Roda todo dia à meia-noite UTC e gera os próximos 90 dias de ocorrências
const schedulerQueue = new Queue<RecurringTransactionsJobData>('recurring-transactions', {
  connection: redisBullmq,
})

schedulerQueue
  .upsertJobScheduler(
    'daily-recurring-generation',
    { pattern: '0 0 * * *' }, // todo dia às 00:00 UTC
    {
      name: 'recurring-transactions',
      data: { targetDate: '' }, // worker resolve para new Date() quando vazio
    },
  )
  .catch((err) => {
    console.error('[RecurringWorker] Falha ao registrar job scheduler:', err.message)
  })
