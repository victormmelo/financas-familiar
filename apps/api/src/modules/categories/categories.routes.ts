import type { FastifyPluginAsync } from 'fastify'
import { createCategorySchema, updateCategorySchema } from './categories.schema.js'
import * as categoriesService from './categories.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const categoriesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /categories
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    return categoriesService.listCategories(user.familyId)
  })

  // POST /categories — ADMIN only
  fastify.post('/', async (request, reply) => {
    const user = request.user as TokenPayload
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ statusCode: 403, message: 'Apenas ADMINs podem criar categorias' })
    }

    const input = createCategorySchema.parse(request.body)
    const category = await categoriesService.createCategory(user.familyId, input)
    return reply.status(201).send(category)
  })

  // PATCH /categories/:id — ADMIN only
  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ statusCode: 403, message: 'Apenas ADMINs podem editar categorias' })
    }

    const input = updateCategorySchema.parse(request.body)
    return categoriesService.updateCategory(user.familyId, request.params.id, input)
  })

  // DELETE /categories/:id — ADMIN only
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ statusCode: 403, message: 'Apenas ADMINs podem excluir categorias' })
    }

    await categoriesService.deleteCategory(user.familyId, request.params.id)
    return reply.status(204).send()
  })
}

export default categoriesRoutes
