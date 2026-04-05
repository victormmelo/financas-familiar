import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { redis } from '../lib/redis.js'

export async function registerRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    // Limite global: 200 req/min por IP
    max: 200,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Muitas requisições. Tente novamente em ${context.after}.`,
      },
    }),
  })
}
