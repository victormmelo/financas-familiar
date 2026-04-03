import type { FastifyPluginAsync } from 'fastify'
import {
  createTransactionSchema,
  updateTransactionSchema,
  bulkConfirmSchema,
  listTransactionsSchema,
} from './transactions.schema.js'
import * as transactionsService from './transactions.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const transactionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /transactions
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    const query = listTransactionsSchema.parse(request.query)
    return transactionsService.listTransactions(user.familyId, query)
  })

  // GET /transactions/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    return transactionsService.getTransaction(user.familyId, request.params.id)
  })

  // POST /transactions
  fastify.post('/', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createTransactionSchema.parse(request.body)
    const transaction = await transactionsService.createTransaction(user.familyId, user.sub, input)
    return reply.status(201).send(transaction)
  })

  // POST /transactions/bulk-confirm
  fastify.post('/bulk-confirm', async (request) => {
    const user = request.user as TokenPayload
    const input = bulkConfirmSchema.parse(request.body)
    return transactionsService.bulkConfirm(user.familyId, input)
  })

  // POST /transactions/:id/confirm
  fastify.post<{ Params: { id: string } }>('/:id/confirm', async (request) => {
    const user = request.user as TokenPayload
    return transactionsService.confirmTransaction(user.familyId, request.params.id)
  })

  // PATCH /transactions/:id
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    const input = updateTransactionSchema.parse(request.body)
    return transactionsService.updateTransaction(user.familyId, request.params.id, input)
  })

  // DELETE /transactions/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    await transactionsService.deleteTransaction(user.familyId, request.params.id)
    return reply.status(204).send()
  })
}

export default transactionsRoutes
