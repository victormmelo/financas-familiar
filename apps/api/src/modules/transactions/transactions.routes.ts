import type { FastifyPluginAsync } from 'fastify'
import {
  createTransactionSchema,
  updateTransactionSchema,
  bulkConfirmSchema,
  bulkSetCategorySchema,
  listTransactionsSchema,
  dashboardSummarySchema,
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

  // GET /transactions/dashboard-summary
  fastify.get('/dashboard-summary', async (request) => {
    const user = request.user as TokenPayload
    const query = dashboardSummarySchema.parse(request.query)
    return transactionsService.getDashboardSummary(user.familyId, query)
  })

  // GET /transactions/:id/reimbursement-context
  fastify.get<{ Params: { id: string } }>('/:id/reimbursement-context', async (request) => {
    const user = request.user as TokenPayload
    return transactionsService.getReimbursementContext(user.familyId, request.params.id)
  })

  // GET /transactions/recurring — lista templates recorrentes
  fastify.get('/recurring', async (request) => {
    const user = request.user as TokenPayload
    return transactionsService.listRecurringTemplates(user.familyId)
  })

  // POST /transactions/trash/empty — apaga definitivamente todas na lixeira (antes de /:id)
  fastify.post('/trash/empty', async (request, reply) => {
    const user = request.user as TokenPayload
    const result = await transactionsService.emptyTransactionTrash(user.familyId)
    return reply.status(200).send(result)
  })

  // POST /transactions/:id/restore
  fastify.post<{ Params: { id: string } }>('/:id/restore', async (request) => {
    const user = request.user as TokenPayload
    return transactionsService.restoreTransaction(user.familyId, request.params.id)
  })

  // DELETE /transactions/:id/permanent
  fastify.delete<{ Params: { id: string } }>('/:id/permanent', async (request, reply) => {
    const user = request.user as TokenPayload
    await transactionsService.permanentlyDeleteTransaction(user.familyId, request.params.id)
    return reply.status(204).send()
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

    if (input.installmentCount && input.installmentCount >= 2) {
      // Criação parcelada
      const result = await transactionsService.createInstallmentTransaction(
        user.familyId,
        user.sub,
        { ...input, installmentCount: input.installmentCount },
      )
      return reply.status(201).send(result)
    }

    const transaction = await transactionsService.createTransaction(user.familyId, user.sub, input)
    return reply.status(201).send(transaction)
  })

  // POST /transactions/bulk-confirm
  fastify.post('/bulk-confirm', async (request) => {
    const user = request.user as TokenPayload
    const input = bulkConfirmSchema.parse(request.body)
    return transactionsService.bulkConfirm(user.familyId, input)
  })

  // POST /transactions/bulk-set-category
  fastify.post('/bulk-set-category', async (request) => {
    const user = request.user as TokenPayload
    const input = bulkSetCategorySchema.parse(request.body)
    return transactionsService.bulkSetCategory(user.familyId, input)
  })

  // POST /transactions/:id/confirm
  fastify.post<{ Params: { id: string } }>('/:id/confirm', async (request) => {
    const user = request.user as TokenPayload
    return transactionsService.confirmTransaction(user.familyId, request.params.id)
  })

  // DELETE /transactions/recurring/:id — cancela template e futuros drafts
  fastify.delete<{ Params: { id: string } }>('/recurring/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    await transactionsService.cancelRecurringTemplate(user.familyId, request.params.id)
    return reply.status(204).send()
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
