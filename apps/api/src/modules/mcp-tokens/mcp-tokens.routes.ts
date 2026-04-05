import type { FastifyPluginAsync } from 'fastify'
import * as mcpTokensService from './mcp-tokens.service.js'
import { createMcpTokenSchema } from './mcp-tokens.schema.js'
import type { TokenPayload } from '../auth/auth.types.js'

const mcpTokensRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // POST /mcp-tokens — cria novo token
  fastify.post('/', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createMcpTokenSchema.parse(request.body)
    const result = await mcpTokensService.createMcpToken(user.sub, user.familyId, input)
    return reply.status(201).send({ data: result })
  })

  // GET /mcp-tokens — lista tokens do usuário
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    const tokens = await mcpTokensService.listMcpTokens(user.sub)
    return { data: tokens }
  })

  // DELETE /mcp-tokens/:id — revoga token
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    await mcpTokensService.revokeMcpToken(user.sub, request.params.id)
    return reply.status(204).send()
  })
}

export default mcpTokensRoutes
