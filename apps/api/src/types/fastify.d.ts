import type { FastifyRequest, FastifyReply } from 'fastify'
import type { TokenPayload } from '../modules/auth/auth.types.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Payload normalizado (id interno Prisma) após `authenticate`. */
    user?: TokenPayload
  }

  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>
  }
}
