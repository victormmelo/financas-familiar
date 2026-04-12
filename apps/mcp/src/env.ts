import { z } from 'zod'
import './load-env.js'

const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') return undefined
    return value
  }, schema)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MCP_PORT: z.coerce.number().int().positive().default(3002),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  KEYCLOAK_ISSUER: z.string().url('KEYCLOAK_ISSUER deve ser uma URL'),
  KEYCLOAK_JWKS_URI: emptyStringToUndefined(z.string().url().optional()),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  console.error('❌ Variáveis de ambiente inválidas ou ausentes no MCP:')
  const errors = result.error.flatten().fieldErrors
  for (const [key, messages] of Object.entries(errors)) {
    console.error(`   ${key}: ${messages?.join(', ')}`)
  }
  process.exit(1)
}

export const env = result.data
