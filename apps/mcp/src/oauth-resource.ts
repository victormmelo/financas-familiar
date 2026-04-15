import { env } from './env.js'
import { MCP_OAUTH_SCOPES } from './mcp-scopes.js'

/** URL canónica do recurso MCP (RFC 8707 / Apps SDK), sem barra final. */
export function getMcpResourceIdentifier(): string {
  return env.MCP_RESOURCE_URL
}

/**
 * URL absoluta do documento de metadados (RFC 9728).
 * Usa o path do identificador de recurso quando este inclui pathname (ex.: /mcp).
 */
export function getOAuthProtectedResourceMetadataUrl(): string {
  const rid = getMcpResourceIdentifier()
  try {
    const u = new URL(rid)
    const prefix = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')
    return `${u.origin}${prefix}/.well-known/oauth-protected-resource`
  } catch {
    return `${rid}/.well-known/oauth-protected-resource`
  }
}

/** Paths relativos a servir o mesmo documento (com e sem prefixo /mcp). */
export function oauthProtectedResourcePaths(): string[] {
  const rid = getMcpResourceIdentifier()
  const paths = new Set<string>(['/.well-known/oauth-protected-resource'])
  try {
    const u = new URL(rid)
    if (u.pathname && u.pathname !== '/') {
      const prefix = u.pathname.replace(/\/$/, '')
      paths.add(`${prefix}/.well-known/oauth-protected-resource`)
    }
  } catch {
    /* ignore */
  }
  return [...paths]
}

export function buildOAuthProtectedResourceDocument(): Record<string, unknown> {
  const issuer = env.KEYCLOAK_ISSUER.replace(/\/$/, '')
  return {
    resource: getMcpResourceIdentifier(),
    authorization_servers: [issuer],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ['header'],
  }
}

/** Cabeçalho WWW-Authenticate para 401 (Apps SDK / MCP authorization). */
export function buildWwwAuthenticateBearerChallenge(scopeHint?: string): string {
  const meta = getOAuthProtectedResourceMetadataUrl()
  const scope = scopeHint ?? MCP_OAUTH_SCOPES.join(' ')
  return `Bearer resource_metadata="${meta}", scope="${scope}"`
}

/** Resposta de tool com desafio OAuth (Apps SDK). */
export function mcpAuthToolErrorResult(message: string, scopeHint?: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
    _meta: {
      'mcp/www_authenticate': [buildWwwAuthenticateBearerChallenge(scopeHint)],
    },
  }
}
