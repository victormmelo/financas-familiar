import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { Sentry } from '../lib/sentry.js'

type AppError = Error & { statusCode?: number }

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const appError = error as AppError

    if (error instanceof ZodError) {
      const flat = error.flatten()
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation error',
        issues: flat.fieldErrors,
        formErrors: flat.formErrors,
      })
    }

    if (appError.statusCode && appError.statusCode < 500) {
      return reply.status(appError.statusCode).send({
        statusCode: appError.statusCode,
        error: appError.name,
        message: appError.message,
      })
    }

    if (appError.statusCode === 502) {
      app.log.error({ err: error, reqId: request.id, url: request.url }, appError.message)
      return reply.status(502).send({
        statusCode: 502,
        error: 'Bad Gateway',
        message: appError.message,
      })
    }

    // Erros 5xx: loga e reporta ao Sentry
    app.log.error({ err: error, reqId: request.id, url: request.url }, appError.message)
    Sentry.captureException(error, { extra: { url: request.url, method: request.method } })

    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    })
  })
}
