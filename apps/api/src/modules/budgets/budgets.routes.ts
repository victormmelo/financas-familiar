import type { FastifyPluginAsync } from 'fastify'
import { createBudgetSchema, updateBudgetSchema, listBudgetsSchema } from './budgets.schema.js'
import * as budgetsService from './budgets.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const budgetsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /budgets
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    const query = listBudgetsSchema.parse(request.query)
    return budgetsService.listBudgets(user.familyId, query)
  })

  // GET /budgets/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    return budgetsService.getBudget(user.familyId, request.params.id)
  })

  // POST /budgets
  fastify.post('/', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createBudgetSchema.parse(request.body)
    const budget = await budgetsService.createBudget(user.familyId, input)
    return reply.status(201).send(budget)
  })

  // PATCH /budgets/:id
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    const input = updateBudgetSchema.parse(request.body)
    return budgetsService.updateBudget(user.familyId, request.params.id, input)
  })

  // DELETE /budgets/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    await budgetsService.deleteBudget(user.familyId, request.params.id)
    return reply.status(204).send()
  })
}

export default budgetsRoutes
