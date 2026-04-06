import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createBudgetSchema, updateBudgetSchema, listBudgetsSchema } from './budgets.schema.js'
import * as budgetsService from './budgets.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const monthlySummaryQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

const budgetsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /budgets/monthly-summary
  fastify.get('/monthly-summary', async (request) => {
    const user = request.user as TokenPayload
    const query = monthlySummaryQuerySchema.parse(request.query)
    const now = new Date()
    const month = query.month ?? now.getMonth() + 1
    const year = query.year ?? now.getFullYear()
    return budgetsService.getMonthlySummary(user.familyId, month, year)
  })

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
