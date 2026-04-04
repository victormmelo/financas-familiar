import type { FastifyPluginAsync } from 'fastify'
import { updateFamilySchema } from './family.schema.js'
import * as familyService from './family.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const familyRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /family
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    return familyService.getFamily(user.familyId)
  })

  // PATCH /family — ADMIN only
  fastify.patch('/', async (request, reply) => {
    const user = request.user as TokenPayload
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ statusCode: 403, message: 'Apenas ADMINs podem editar a família' })
    }

    const input = updateFamilySchema.parse(request.body)
    return familyService.updateFamily(user.familyId, input)
  })

  // DELETE /family/members/:userId — ADMIN only
  fastify.delete<{ Params: { userId: string } }>('/members/:userId', async (request, reply) => {
    const user = request.user as TokenPayload
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ statusCode: 403, message: 'Apenas ADMINs podem remover membros' })
    }

    await familyService.removeMember(user.familyId, request.params.userId, user.sub)
    return reply.status(204).send()
  })
}

export default familyRoutes
