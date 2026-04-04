import type { FastifyPluginAsync } from 'fastify'
import { createGoalSchema, updateGoalSchema } from './goals.schema.js'
import * as goalsService from './goals.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const goalsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /goals
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    return goalsService.listGoals(user.familyId)
  })

  // GET /goals/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    return goalsService.getGoal(user.familyId, request.params.id)
  })

  // POST /goals
  fastify.post('/', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createGoalSchema.parse(request.body)
    const goal = await goalsService.createGoal(user.familyId, input)
    return reply.status(201).send(goal)
  })

  // PATCH /goals/:id
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    const input = updateGoalSchema.parse(request.body)
    return goalsService.updateGoal(user.familyId, request.params.id, input)
  })

  // POST /goals/:id/complete
  fastify.post<{ Params: { id: string } }>('/:id/complete', async (request) => {
    const user = request.user as TokenPayload
    return goalsService.completeGoal(user.familyId, request.params.id)
  })

  // DELETE /goals/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    await goalsService.deleteGoal(user.familyId, request.params.id)
    return reply.status(204).send()
  })
}

export default goalsRoutes
