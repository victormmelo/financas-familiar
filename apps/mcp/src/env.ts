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
  /**
   * URL pública do endpoint MCP (ex.: https://mcp.exemplo.com/mcp).
   * Usada como fallback do identificador de recurso OAuth se MCP_RESOURCE_URL não estiver definida.
   */
  MCP_PUBLIC_URL: emptyStringToUndefined(z.string().url().optional()),
  /**
   * Identificador canónico do recurso protegido (RFC 8707). Deve coincidir com o parâmetro `resource`
   * no OAuth do ChatGPT e, em geral, com o claim `aud` do access token.
   * Se omitida, usa MCP_PUBLIC_URL sem barra final (recomendado: definir explicitamente em produção).
   */
  MCP_RESOURCE_URL: emptyStringToUndefined(z.string().url().optional()),
  /** Se true, exige que o token inclua o identificador de recurso em `aud` (fluxo ChatGPT / Apps SDK). */
  MCP_STRICT_RESOURCE_AUDIENCE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
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

const parsed = result.data

const resolvedResource = (
  parsed.MCP_RESOURCE_URL ??
  parsed.MCP_PUBLIC_URL ??
  `http://localhost:${parsed.MCP_PORT}`
).replace(/\/$/, '')

const strictAudience = parsed.MCP_STRICT_RESOURCE_AUDIENCE ?? parsed.NODE_ENV === 'production'

export const env = {
  ...parsed,
  MCP_RESOURCE_URL: resolvedResource,
  MCP_STRICT_RESOURCE_AUDIENCE: strictAudience,
}
