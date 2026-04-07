import type { FastifyPluginAsync } from 'fastify'
import { createTransferSchema, listTransfersSchema } from './transfers.schema.js'
import * as transfersService from './transfers.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const transfersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /transfers
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    const query = listTransfersSchema.parse(request.query)
    return transfersService.listTransfers(user.familyId, query)
  })

  // POST /transfers
  fastify.post('/', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createTransferSchema.parse(request.body)
    const transfer = await transfersService.createTransfer(user.familyId, user.sub, input)
    return reply.status(201).send(transfer)
  })

  // DELETE /transfers/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    await transfersService.deleteTransfer(user.familyId, request.params.id)
    return reply.status(204).send()
  })
}

export default transfersRoutes
