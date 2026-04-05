import './env.js' // valida variáveis de ambiente antes de qualquer outra coisa
import { env } from './env.js'
import { initSentry, Sentry } from './lib/sentry.js'

// Sentry deve ser inicializado antes do Fastify para capturar erros de bootstrap
initSentry()

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
import mcpTokensRoutes from './modules/mcp-tokens/mcp-tokens.routes.js'
import reconciliationRoutes from './modules/reconciliation/reconciliation.routes.js'
import './jobs/email.worker.js'
import './jobs/reports.worker.js'
import './jobs/recurring-transactions.worker.js'

const isDev = env.NODE_ENV !== 'production'

const app = Fastify({
  logger: isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
      }
    : {
        // Em produção: JSON estruturado sem pino-pretty (para coleta por Datadog/CloudWatch/etc.)
        level: 'info',
        serializers: {
          req(request) {
            return { method: request.method, url: request.url }
          },
        },
      },
})

const PORT = env.PORT

const start = async () => {
  try {
    // Plugins
    await registerHelmet(app)
    await registerRateLimit(app)

    await app.register(cors, {
      origin: env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    })

    await app.register(cookie, {
      secret: env.COOKIE_SECRET ?? 'cookie-secret-change-in-production',
    })

    await app.register(jwt, {
      secret: env.JWT_ACCESS_SECRET,
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
    await app.register(mcpTokensRoutes, { prefix: '/mcp-tokens' })
    await app.register(reconciliationRoutes, { prefix: '/reconciliation' })

    await app.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    Sentry.captureException(err)
    app.log.error(err)
    process.exit(1)
  }
}

start()

export default app
