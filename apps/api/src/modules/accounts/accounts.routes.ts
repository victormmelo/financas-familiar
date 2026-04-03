import type { FastifyPluginAsync } from 'fastify'
import { createAccountSchema, updateAccountSchema } from './accounts.schema.js'
import * as accountsService from './accounts.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const accountsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /accounts
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    return accountsService.listAccounts(user.familyId)
  })

  // GET /accounts/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    return accountsService.getAccount(user.familyId, request.params.id)
  })

  // POST /accounts
  fastify.post('/', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createAccountSchema.parse(request.body)
    const account = await accountsService.createAccount(user.familyId, input)
    return reply.status(201).send(account)
  })

  // PATCH /accounts/:id
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    const input = updateAccountSchema.parse(request.body)
    return accountsService.updateAccount(user.familyId, request.params.id, input)
  })

  // DELETE /accounts/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    await accountsService.deleteAccount(user.familyId, request.params.id)
    return reply.status(204).send()
  })
}

export default accountsRoutes
