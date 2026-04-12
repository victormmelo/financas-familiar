import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { extractBearerToken, verifyKeycloakAccessToken } from '../lib/keycloak-jwt.js'
import type { TokenPayload } from '../modules/auth/auth.types.js'

export function registerAuthenticate(app: FastifyInstance) {
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const token = extractBearerToken(request.headers.authorization)

    if (!token) {
      return reply.status(401).send({ statusCode: 401, message: 'Token ausente' })
    }

    let kcClaims: Awaited<ReturnType<typeof verifyKeycloakAccessToken>>
    try {
      kcClaims = await verifyKeycloakAccessToken(token)
    } catch {
      return reply.status(401).send({ statusCode: 401, message: 'Token inválido ou expirado' })
    }

    const user = await prisma.user.findUnique({
      where: { keycloakSub: kcClaims.sub },
    })
    if (!user) {
      return reply.status(403).send({
        statusCode: 403,
        code: 'USER_NOT_PROVISIONED',
        message: 'Conta ainda não vinculada. Conclua o cadastro (bootstrap ou convite).',
      })
    }

    const payload: TokenPayload = {
      sub: user.id,
      familyId: user.familyId,
      role: user.role,
    }
    request.user = payload
  })
}
