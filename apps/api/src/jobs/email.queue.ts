import { Queue } from 'bullmq'
import { redis } from '../lib/redis.js'

export interface InviteEmailJobData {
  to: string
  inviteToken: string
  familyName: string
  invitedByName: string
  appUrl: string
}

export const emailQueue = new Queue<InviteEmailJobData>('email', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})
