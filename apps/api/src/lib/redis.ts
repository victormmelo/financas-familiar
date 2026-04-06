import { Redis } from 'ioredis'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

const baseOptions = { lazyConnect: true } as const

/** Cache, rate limit, tokens de refresh — retries finitos em falhas transitórias. */
export const redis = new Redis(redisUrl, {
  ...baseOptions,
  maxRetriesPerRequest: 3,
})

/**
 * BullMQ (Queue/Worker) exige maxRetriesPerRequest: null — workers usam comandos
 * bloqueantes (BRPOP etc.) e não podem ficar presos em retry por requisição.
 */
export const redisBullmq = new Redis(redisUrl, {
  ...baseOptions,
  maxRetriesPerRequest: null,
})

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message)
})

redisBullmq.on('error', (err) => {
  console.error('[Redis BullMQ] Connection error:', err.message)
})
