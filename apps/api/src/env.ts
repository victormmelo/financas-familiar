import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') return undefined
    return value
  }, schema)

/** Fonte principal: `.env` na raiz do monorepo. Se existir `apps/api/.env`, aplica depois (override local). */
function loadDotenvFromAncestors(): void {
  const found: string[] = []
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    const p = resolve(dir, '.env')
    if (existsSync(p)) found.push(p)
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  for (let i = found.length - 1; i >= 0; i--) {
    loadEnv({ path: found[i]!, override: true })
  }
}

loadDotenvFromAncestors()

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  REDIS_URL: z.string().min(1, 'REDIS_URL é obrigatória'),
  KEYCLOAK_BASE_URL: z.string().url('KEYCLOAK_BASE_URL deve ser uma URL (ex.: http://localhost:8080)'),
  KEYCLOAK_REALM: z.string().min(1, 'KEYCLOAK_REALM é obrigatório'),
  KEYCLOAK_ISSUER: z.string().url('KEYCLOAK_ISSUER deve ser uma URL (ex.: http://localhost:8080/realms/financas-familiar)'),
  KEYCLOAK_AUDIENCE: z.string().min(1, 'KEYCLOAK_AUDIENCE é obrigatório (client id OIDC)'),
  KEYCLOAK_WEB_CLIENT_ID: z.string().min(1, 'KEYCLOAK_WEB_CLIENT_ID é obrigatório'),
  KEYCLOAK_MCP_CLIENT_ID: z.string().min(1, 'KEYCLOAK_MCP_CLIENT_ID é obrigatório'),
  KEYCLOAK_IDENTITY_ADMIN_CLIENT_ID: z.string().min(1, 'KEYCLOAK_IDENTITY_ADMIN_CLIENT_ID é obrigatório'),
  KEYCLOAK_IDENTITY_ADMIN_CLIENT_SECRET: z.string().min(1).optional(),
  KEYCLOAK_ADMIN_USERNAME: z.string().min(1).optional(),
  KEYCLOAK_ADMIN_PASSWORD: z.string().min(1).optional(),
  KEYCLOAK_JWKS_URI: emptyStringToUndefined(z.string().url().optional()),

  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().optional(),
  COOKIE_SECRET: z.string().min(32).optional(),
  APP_URL: z.string().url().optional(),
  MCP_PUBLIC_URL: z.string().url().optional(),

  // Email (opcional em dev)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Storage S3/MinIO (opcional em dev)
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),

  // IA (opcional)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Monitoramento
  SENTRY_DSN: z.string().url().optional(),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  console.error('❌  Variáveis de ambiente inválidas ou ausentes:')
  const errors = result.error.flatten().fieldErrors
  for (const [key, messages] of Object.entries(errors)) {
    console.error(`   ${key}: ${messages?.join(', ')}`)
  }
  process.exit(1)
}

export const env = result.data
