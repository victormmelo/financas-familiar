import type { FastifyPluginAsync } from 'fastify'
import { createReportSchema, listReportsSchema } from './reports.schema.js'
import * as reportsService from './reports.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /reports
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    const query = listReportsSchema.parse(request.query)
    return reportsService.listReports(user.familyId, query)
  })

  // GET /reports/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    return reportsService.getReport(user.familyId, request.params.id)
  })

  // POST /reports
  fastify.post('/', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createReportSchema.parse(request.body)
    const report = await reportsService.createReport(user.familyId, input)
    return reply.status(202).send(report)
  })
}

export default reportsRoutes
