import { Worker, Queue } from 'bullmq'
import { RRule } from 'rrule'
import { prisma } from '../lib/prisma.js'
import { redisBullmq } from '../lib/redis.js'
import type { RecurringTransactionsJobData } from './recurring-transactions.queue.js'

/**
 * Para cada transação com isRecurring=true e rrule definida,
 * verifica se já existe uma ocorrência (DRAFT ou CONFIRMED) para a data alvo.
 * Se não existir, cria um novo DRAFT espelhando os dados da transação original.
 */
async function generateOccurrences(targetDate: Date) {
  const targetDateOnly = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()),
  )
  const nextDay = new Date(targetDateOnly)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)

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

    // Verifica se a regra produz uma ocorrência nessa data
    const occurrences = rule.between(targetDateOnly, nextDay, true)
    if (occurrences.length === 0) {
      skipped++
      continue
    }

    // Verifica se já existe um lançamento para essa data gerado a partir desse template
    // Usa a combinação familyId + accountId + description + date como chave de idempotência
    const existing = await prisma.transaction.findFirst({
      where: {
        familyId: template.familyId,
        accountId: template.accountId,
        description: template.description,
        date: targetDateOnly,
        source: template.source,
        status: { in: ['DRAFT', 'CONFIRMED'] },
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
        status: 'DRAFT',
        amount: template.amount,
        description: template.description,
        notes: template.notes,
        date: targetDateOnly,
        source: template.source,
        creditCardId: template.creditCardId,
        isRecurring: false, // a ocorrência em si não é recorrente
      },
    })

    created++
  }

  return { templates: templates.length, created, skipped }
}

export const recurringTransactionsWorker = new Worker<RecurringTransactionsJobData>(
  'recurring-transactions',
  async (job) => {
    const targetDate = job.data.targetDate
      ? new Date(job.data.targetDate)
      : new Date()

    const result = await generateOccurrences(targetDate)
    console.log(
      `[RecurringWorker] Data: ${targetDate.toISOString().slice(0, 10)} | Templates: ${result.templates} | Criados: ${result.created} | Ignorados: ${result.skipped}`,
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
// Registra um job repetível que roda todo dia à meia-noite UTC
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
