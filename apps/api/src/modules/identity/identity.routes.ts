import type { FastifyPluginAsync } from 'fastify'
import type { TokenPayload } from '../auth/auth.types.js'
import {
  clientCredentialsSchema,
  createIntegrationSchema,
  integrationParamsSchema,
  updateIntegrationSchema,
} from './identity.schema.js'
import * as identityService from './identity.service.js'

const identityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.addHook('preHandler', async (request, reply) => {
    const user = request.user as TokenPayload
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ statusCode: 403, message: 'Apenas ADMINs podem gerenciar integrações' })
    }
  })

  fastify.get('/metadata', async () => ({ data: identityService.getIdentityMetadata() }))

  fastify.post('/client-credentials', async (request) => {
    const user = request.user as TokenPayload
    const input = clientCredentialsSchema.parse(request.body)
    return { data: await identityService.exchangeClientCredentialsToken(user.familyId, input) }
  })

  fastify.get('/clients', async (request) => {
    const user = request.user as TokenPayload
    return { data: await identityService.listManagedClients(user.familyId) }
  })

  fastify.get('/integrations', async (request) => {
    const user = request.user as TokenPayload
    return { data: await identityService.listIntegrations(user.familyId) }
  })

  fastify.post('/integrations', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createIntegrationSchema.parse(request.body)
    const result = await identityService.createIntegration(user, input)
    return reply.status(201).send({ data: result })
  })

  fastify.patch<{ Params: { id: string } }>('/integrations/:id', async (request) => {
    const user = request.user as TokenPayload
    const { id } = integrationParamsSchema.parse(request.params)
    const input = updateIntegrationSchema.parse(request.body)
    return { data: await identityService.updateIntegrationStatus(user.familyId, id, input) }
  })

  fastify.post<{ Params: { id: string } }>('/integrations/:id/rotate-secret', async (request) => {
    const user = request.user as TokenPayload
    const { id } = integrationParamsSchema.parse(request.params)
    return { data: await identityService.rotateSecret(user.familyId, id) }
  })

  fastify.post<{ Params: { id: string } }>('/integrations/:id/repair-oauth', async (request) => {
    const user = request.user as TokenPayload
    const { id } = integrationParamsSchema.parse(request.params)
    return { data: await identityService.repairIntegrationOauthInKeycloak(user.familyId, id) }
  })

  fastify.delete<{ Params: { id: string } }>('/integrations/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    const { id } = integrationParamsSchema.parse(request.params)
    await identityService.revokeIntegration(user.familyId, id)
    return reply.status(204).send()
  })
}

export default identityRoutes
