import type { FastifyInstance } from 'fastify'
import * as service from './reconciliation.service.js'
import {
  createStatementItemSchema,
  listStatementItemsSchema,
  runMatchingSchema,
  acceptMatchSchema,
  convertItemSchema,
  getBalanceSchema,
} from './reconciliation.schema.js'
import type { TokenPayload } from '../auth/auth.types.js'

export default async function reconciliationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // POST /reconciliation/import — multipart OFX/CSV
  app.post('/import', async (request, reply) => {
    const user = request.user as TokenPayload
    const parts = request.parts() as AsyncIterableIterator<import('@fastify/multipart').Multipart>
    const result = await service.importStatement(user.familyId, user.sub, parts)
    return reply.status(201).send({ data: result })
  })

  // POST /reconciliation/items — manual entry
  app.post('/items', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createStatementItemSchema.parse(request.body)
    const item = await service.createStatementItem(user.familyId, input)
    return reply.status(201).send({ data: item })
  })

  // GET /reconciliation/items
  app.get('/items', async (request) => {
    const user = request.user as TokenPayload
    const query = listStatementItemsSchema.parse(request.query)
    return service.listStatementItems(user.familyId, query)
  })

  // DELETE /reconciliation/items/:id — soft delete
  app.delete<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    await service.deleteStatementItem(user.familyId, request.params.id)
    return reply.status(204).send()
  })

  // POST /reconciliation/match — run/rerun auto-matching
  app.post('/match', async (request) => {
    const user = request.user as TokenPayload
    const input = runMatchingSchema.parse(request.body)
    const result = await service.runMatching(user.familyId, input)
    return { data: result }
  })

  // PATCH /reconciliation/items/:id/accept-match
  app.patch<{ Params: { id: string } }>('/items/:id/accept-match', async (request) => {
    const user = request.user as TokenPayload
    const input = acceptMatchSchema.parse(request.body)
    const item = await service.acceptMatch(user.familyId, request.params.id, input)
    return { data: item }
  })

  // PATCH /reconciliation/items/:id/reject-match
  app.patch<{ Params: { id: string } }>('/items/:id/reject-match', async (request) => {
    const user = request.user as TokenPayload
    const item = await service.rejectMatch(user.familyId, request.params.id)
    return { data: item }
  })

  // PATCH /reconciliation/items/:id/ignore
  app.patch<{ Params: { id: string } }>('/items/:id/ignore', async (request) => {
    const user = request.user as TokenPayload
    const item = await service.ignoreItem(user.familyId, request.params.id)
    return { data: item }
  })

  // POST /reconciliation/items/:id/convert — create Transaction from item
  app.post<{ Params: { id: string } }>('/items/:id/convert', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = convertItemSchema.parse(request.body)
    const tx = await service.convertItem(user.familyId, user.sub, request.params.id, input)
    return reply.status(201).send({ data: tx })
  })

  // GET /reconciliation/balance/:accountId?reportedBalance=1234.56
  app.get<{ Params: { accountId: string } }>('/balance/:accountId', async (request) => {
    const user = request.user as TokenPayload
    const { reportedBalance } = getBalanceSchema.parse(request.query)
    const result = await service.getBalanceSummary(
      user.familyId,
      request.params.accountId,
      reportedBalance,
    )
    return { data: result }
  })
}
