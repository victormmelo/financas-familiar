import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation error',
        issues: error.flatten().fieldErrors,
      })
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      })
    }

    app.log.error(error)

    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    })
  })
}
