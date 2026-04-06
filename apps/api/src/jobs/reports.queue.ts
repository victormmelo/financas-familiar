import { Queue } from 'bullmq'
import { redisBullmq } from '../lib/redis.js'

export interface ReportJobData {
  reportId: string
  familyId: string
  type: 'DRE' | 'CASH_FLOW' | 'PATRIMONY'
  params: {
    startDate?: string
    endDate?: string
    referenceMonth?: number
    referenceYear?: number
  }
}

export const reportsQueue = new Queue<ReportJobData>('reports', {
  connection: redisBullmq,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  },
})
