import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import {
  bootstrapSchema,
  inviteSchema,
  acceptInviteSchema,
  patchEntryPreferencesSchema,
} from './auth.schema.js'
import * as authService from './auth.service.js'
import type { TokenPayload } from './auth.types.js'
import { extractBearerToken, verifyKeycloakAccessToken } from '../../lib/keycloak-jwt.js'

async function readKeycloakClaims(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Awaited<ReturnType<typeof verifyKeycloakAccessToken>> | undefined> {
  const token = extractBearerToken(request.headers.authorization)
  if (!token) {
    reply.status(401).send({ statusCode: 401, message: 'Token ausente' })
    return undefined
  }
  try {
    return await verifyKeycloakAccessToken(token)
  } catch {
    reply.status(401).send({ statusCode: 401, message: 'Token inválido ou expirado' })
    return undefined
  }
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /auth/me — token Keycloak válido; retorna perfil Prisma ou null (precisa bootstrap/convite)
  fastify.get('/me', async (request, reply) => {
    const claims = await readKeycloakClaims(request, reply)
    if (!claims) return
    const user = await authService.findAuthUserByKeycloakSub(claims.sub)
    return { data: user }
  })

  fastify.patch(
    '/me/entry-preferences',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = patchEntryPreferencesSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          message: 'Payload inválido',
          details: parsed.error.flatten(),
        })
      }
      const user = request.user as TokenPayload
      try {
        const entryPreferences = await authService.updateUserEntryPreferences(
          user.sub,
          user.familyId,
          parsed.data,
        )
        return { data: { entryPreferences } }
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string }
        if (e.statusCode) {
          return reply.status(e.statusCode).send({ statusCode: e.statusCode, message: e.message })
        }
        throw err
      }
    },
  )

  // POST /auth/bootstrap — primeiro acesso OIDC
  fastify.post(
    '/bootstrap',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const claims = await readKeycloakClaims(request, reply)
      if (!claims) return
      const input = bootstrapSchema.parse(request.body)
      try {
        const result = await authService.bootstrap(input, claims)
        return reply.status(201).send({ data: result })
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string }
        if (e.statusCode) {
          return reply.status(e.statusCode).send({ statusCode: e.statusCode, message: e.message })
        }
        throw err
      }
    },
  )

  // POST /auth/invite — ADMIN only
  fastify.post(
    '/invite',
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      const user = request.user as TokenPayload
      if (user.role !== 'ADMIN') {
        return reply.status(403).send({ statusCode: 403, message: 'Apenas ADMINs podem convidar membros' })
      }

      const input = inviteSchema.parse(request.body)
      const result = await authService.invite(user.familyId, user.sub, input)
      return reply.status(201).send({ data: result })
    },
  )

  // POST /auth/accept-invite/:token — Bearer Keycloak; e-mail do token = e-mail do convite
  fastify.post<{ Params: { token: string } }>(
    '/accept-invite/:token',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const claims = await readKeycloakClaims(request, reply)
      if (!claims) return
      const { token } = request.params
      const input = acceptInviteSchema.parse(request.body)
      try {
        const result = await authService.acceptInvite(token, input, claims)
        return reply.status(201).send({ data: result })
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string }
        if (e.statusCode) {
          return reply.status(e.statusCode).send({ statusCode: e.statusCode, message: e.message })
        }
        throw err
      }
    },
  )
}

export default authRoutes
