import { env } from './env.js'
import { getMcpResourceIdentifier } from './oauth-resource.js'

const issuer = env.KEYCLOAK_ISSUER.replace(/\/$/, '')
const TTL_MS = 5 * 60 * 1000

type CacheEntry = { body: Record<string, unknown>; fetchedAt: number }

let cachedOAuthAs: CacheEntry | null = null
let cachedOidc: CacheEntry | null = null

function dcrProxyPathFromResourceIdentifier(): string {
  try {
    const rid = getMcpResourceIdentifier()
    const u = new URL(rid)
    const prefix = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : ''
    return `${prefix}/oauth/register`
  } catch {
    return '/oauth/register'
  }
}

function withRegistrationEndpointMirror(body: Record<string, unknown>): Record<string, unknown> {
  const current = body.registration_endpoint
  if (typeof current !== 'string' || current.length === 0) return body
  try {
    const rid = getMcpResourceIdentifier()
    const u = new URL(rid)
    return {
      ...body,
      registration_endpoint: `${u.origin}${dcrProxyPathFromResourceIdentifier()}`,
    }
  } catch {
    return body
  }
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Falha ao obter metadata (${res.status}) de ${url}`)
  }
  return (await res.json()) as Record<string, unknown>
}

/** Espelha o documento RFC 8414 do Keycloak (cache em memória). */
export async function getMirroredOAuthAuthorizationServerMetadata(): Promise<Record<string, unknown>> {
  const now = Date.now()
  if (cachedOAuthAs && now - cachedOAuthAs.fetchedAt < TTL_MS) {
    return cachedOAuthAs.body
  }
  const body = withRegistrationEndpointMirror(await fetchJson(`${issuer}/.well-known/oauth-authorization-server`))
  cachedOAuthAs = { body, fetchedAt: now }
  return body
}

/** Espelha o OpenID Discovery do Keycloak (cache em memória). */
export async function getMirroredOpenIdConfigurationMetadata(): Promise<Record<string, unknown>> {
  const now = Date.now()
  if (cachedOidc && now - cachedOidc.fetchedAt < TTL_MS) {
    return cachedOidc.body
  }
  const body = withRegistrationEndpointMirror(await fetchJson(`${issuer}/.well-known/openid-configuration`))
  cachedOidc = { body, fetchedAt: now }
  return body
}

/**
 * Paths a expor no host do MCP (compatibilidade com clientes que pedem AS metadata no mesmo host do URL do conector).
 * Inclui raiz e, se o recurso tiver pathname (ex. /mcp), o prefixo equivalente ao PRM.
 */
export function oauthAuthorizationServerMirrorPaths(): string[] {
  const paths = new Set<string>([
    '/.well-known/oauth-authorization-server',
    '/.well-known/openid-configuration',
  ])
  try {
    const rid = getMcpResourceIdentifier()
    const u = new URL(rid)
    if (u.pathname && u.pathname !== '/') {
      const prefix = u.pathname.replace(/\/$/, '')
      paths.add(`${prefix}/.well-known/oauth-authorization-server`)
      paths.add(`${prefix}/.well-known/openid-configuration`)
    }
  } catch {
    /* ignore */
  }
  return [...paths]
}

/** Paths de proxy do endpoint DCR (RFC 7591) no mesmo host do MCP. */
export function oauthDynamicClientRegistrationProxyPaths(): string[] {
  const paths = new Set<string>(['/oauth/register'])
  try {
    const rid = getMcpResourceIdentifier()
    const u = new URL(rid)
    if (u.pathname && u.pathname !== '/') {
      const prefix = u.pathname.replace(/\/$/, '')
      paths.add(`${prefix}/oauth/register`)
    }
  } catch {
    /* ignore */
  }
  return [...paths]
}
