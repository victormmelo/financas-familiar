import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export function registerAuthenticate(app: FastifyInstance) {
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ statusCode: 401, message: 'Token inválido ou expirado' })
    }
  })
}
