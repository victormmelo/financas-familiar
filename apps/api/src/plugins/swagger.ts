import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import scalarApiReference from '@scalar/fastify-api-reference'

export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Família Finance API',
        description: 'API para gerenciamento de finanças familiares',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  })

  app.get('/openapi.json', { schema: { hide: true } }, () => app.swagger())

  await app.register(scalarApiReference, {
    routePrefix: '/docs',
    configuration: {
      url: '/openapi.json',
      theme: 'purple',
      defaultHttpClient: { targetKey: 'js', clientKey: 'fetch' },
    },
  })
}
