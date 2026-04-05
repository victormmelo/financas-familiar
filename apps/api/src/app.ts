import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { registerSwagger } from './plugins/swagger.js'
import { registerErrorHandler } from './plugins/error-handler.js'
import { registerAuthenticate } from './plugins/authenticate.js'
import { registerHelmet } from './plugins/helmet.js'
import { registerRateLimit } from './plugins/rate-limit.js'
import authRoutes from './modules/auth/auth.routes.js'
import familyRoutes from './modules/family/family.routes.js'
import accountsRoutes from './modules/accounts/accounts.routes.js'
import categoriesRoutes from './modules/categories/categories.routes.js'
import transactionsRoutes from './modules/transactions/transactions.routes.js'
import transfersRoutes from './modules/transfers/transfers.routes.js'
import creditCardsRoutes from './modules/credit-cards/credit-cards.routes.js'
import goalsRoutes from './modules/goals/goals.routes.js'
import budgetsRoutes from './modules/budgets/budgets.routes.js'
import reportsRoutes from './modules/reports/reports.routes.js'
import './jobs/email.worker.js'
import './jobs/reports.worker.js'
import './jobs/recurring-transactions.worker.js'

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
})

const PORT = Number(process.env.PORT) || 3001

const start = async () => {
  try {
    // Plugins
    await registerHelmet(app)
    await registerRateLimit(app)

    await app.register(cors, {
      origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    })

    await app.register(cookie, {
      secret: process.env.COOKIE_SECRET ?? 'cookie-secret-change-in-production',
    })

    await app.register(jwt, {
      secret: process.env.JWT_ACCESS_SECRET ?? 'jwt-access-secret-change-in-production',
      cookie: {
        cookieName: 'refreshToken',
        signed: false,
      },
    })

    await registerSwagger(app)
    registerErrorHandler(app)
    registerAuthenticate(app)

    // Routes
    await app.register(authRoutes, { prefix: '/auth' })
    await app.register(familyRoutes, { prefix: '/family' })
    await app.register(accountsRoutes, { prefix: '/accounts' })
    await app.register(categoriesRoutes, { prefix: '/categories' })
    await app.register(transactionsRoutes, { prefix: '/transactions' })
    await app.register(transfersRoutes, { prefix: '/transfers' })
    await app.register(creditCardsRoutes, { prefix: '/credit-cards' })
    await app.register(goalsRoutes, { prefix: '/goals' })
    await app.register(budgetsRoutes, { prefix: '/budgets' })
    await app.register(reportsRoutes, { prefix: '/reports' })

    await app.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()

export default app
