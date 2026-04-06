import { Queue } from 'bullmq'
import { redisBullmq } from '../lib/redis.js'

// Job disparado diariamente para gerar ocorrências de transações recorrentes
export interface RecurringTransactionsJobData {
  targetDate: string // ISO date string (YYYY-MM-DD) para qual dia gerar ocorrências
}

export const recurringTransactionsQueue = new Queue<RecurringTransactionsJobData>(
  'recurring-transactions',
  {
    connection: redisBullmq,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 30 },
    },
  },
)
