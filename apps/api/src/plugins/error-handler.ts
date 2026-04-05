import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { Sentry } from '../lib/sentry.js'

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation error',
        issues: error.flatten().fieldErrors,
      })
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      })
    }

    // Erros 5xx: loga e reporta ao Sentry
    app.log.error({ err: error, reqId: request.id, url: request.url }, error.message)
    Sentry.captureException(error, { extra: { url: request.url, method: request.method } })

    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    })
  })
}
