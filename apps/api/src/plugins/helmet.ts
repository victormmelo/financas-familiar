import type { FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'

export async function registerHelmet(app: FastifyInstance) {
  await app.register(helmet, {
    // Permite o Swagger UI carregar seus próprios scripts/estilos em desenvolvimento
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  })
}
