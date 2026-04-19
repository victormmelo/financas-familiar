import type { FastifyPluginAsync } from 'fastify'
import {
  createCreditCardSchema,
  updateCreditCardSchema,
  listInvoicesSchema,
  payInvoiceSchema,
  createInvoiceSettlementSchema,
} from './credit-cards.schema.js'
import * as creditCardsService from './credit-cards.service.js'
import type { TokenPayload } from '../auth/auth.types.js'

const creditCardsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /credit-cards
  fastify.get('/', async (request) => {
    const user = request.user as TokenPayload
    return creditCardsService.listCreditCards(user.familyId)
  })

  // GET /credit-cards/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    return creditCardsService.getCreditCard(user.familyId, request.params.id)
  })

  // POST /credit-cards
  fastify.post('/', async (request, reply) => {
    const user = request.user as TokenPayload
    const input = createCreditCardSchema.parse(request.body)
    const card = await creditCardsService.createCreditCard(user.familyId, input)
    return reply.status(201).send(card)
  })

  // PATCH /credit-cards/:id
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const user = request.user as TokenPayload
    const input = updateCreditCardSchema.parse(request.body)
    return creditCardsService.updateCreditCard(user.familyId, request.params.id, input)
  })

  // DELETE /credit-cards/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as TokenPayload
    await creditCardsService.deleteCreditCard(user.familyId, request.params.id)
    return reply.status(204).send()
  })

  // GET /credit-cards/:id/invoices
  fastify.get<{ Params: { id: string } }>('/:id/invoices', async (request) => {
    const user = request.user as TokenPayload
    const query = listInvoicesSchema.parse(request.query)
    return creditCardsService.listInvoices(user.familyId, request.params.id, query)
  })

  // GET /credit-cards/:id/invoices/current
  fastify.get<{ Params: { id: string } }>('/:id/invoices/current', async (request) => {
    const user = request.user as TokenPayload
    return creditCardsService.getCurrentInvoice(user.familyId, request.params.id)
  })

  // GET /credit-cards/:id/invoices/:invoiceId
  fastify.get<{ Params: { id: string; invoiceId: string } }>(
    '/:id/invoices/:invoiceId',
    async (request) => {
      const user = request.user as TokenPayload
      return creditCardsService.getInvoice(user.familyId, request.params.id, request.params.invoiceId)
    },
  )

  // POST /credit-cards/:id/invoices/:invoiceId/pay
  fastify.post<{ Params: { id: string; invoiceId: string } }>(
    '/:id/invoices/:invoiceId/pay',
    async (request) => {
      const user = request.user as TokenPayload
      const input = payInvoiceSchema.parse(request.body)
      return creditCardsService.payInvoice(
        user.familyId,
        user.sub,
        request.params.id,
        request.params.invoiceId,
        input,
      )
    },
  )

  // POST /credit-cards/:id/invoices/:invoiceId/payments
  fastify.post<{ Params: { id: string; invoiceId: string } }>(
    '/:id/invoices/:invoiceId/payments',
    async (request) => {
      const user = request.user as TokenPayload
      const input = payInvoiceSchema.parse(request.body)
      return creditCardsService.payInvoice(
        user.familyId,
        user.sub,
        request.params.id,
        request.params.invoiceId,
        input,
      )
    },
  )

  // GET /credit-cards/:id/invoices/:invoiceId/statement
  fastify.get<{ Params: { id: string; invoiceId: string } }>(
    '/:id/invoices/:invoiceId/statement',
    async (request) => {
      const user = request.user as TokenPayload
      return creditCardsService.getInvoiceStatement(user.familyId, request.params.id, request.params.invoiceId)
    },
  )

  // POST /credit-cards/:id/invoices/:invoiceId/settlements
  fastify.post<{ Params: { id: string; invoiceId: string } }>(
    '/:id/invoices/:invoiceId/settlements',
    async (request) => {
      const user = request.user as TokenPayload
      const input = createInvoiceSettlementSchema.parse(request.body)
      return creditCardsService.createInvoiceSettlement(
        user.familyId,
        user.sub,
        request.params.id,
        request.params.invoiceId,
        input,
      )
    },
  )
}

export default creditCardsRoutes
