import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { prisma } from './prisma.js'
import type { McpContext } from './context.js'
import { env } from './env.js'
import { MCP_OAUTH_SCOPES } from './mcp-scopes.js'

type KeycloakClaims = JWTPayload & {
  sub?: string
  azp?: string
  client_id?: string
  scope?: string
  email?: string
}

const issuer = env.KEYCLOAK_ISSUER.replace(/\/$/, '')
let jwksRemote: ReturnType<typeof createRemoteJWKSet> | undefined
let jwksUriLoaded: string | undefined
let oidcJwksUriCache: { uri: string; expiresAt: number } | undefined
const OIDC_CACHE_MS = 60 * 60 * 1000

async function resolveJwksUri(): Promise<string> {
  if (env.KEYCLOAK_JWKS_URI) return env.KEYCLOAK_JWKS_URI
  const now = Date.now()
  if (oidcJwksUriCache && oidcJwksUriCache.expiresAt > now) {
    return oidcJwksUriCache.uri
  }
  const wellKnown = `${issuer}/.well-known/openid-configuration`
  const res = await fetch(wellKnown)
  if (!res.ok) {
    throw new Error(`Falha ao obter OpenID Discovery (${res.status})`)
  }
  const doc = (await res.json()) as { jwks_uri?: string }
  if (!doc.jwks_uri) throw new Error('OpenID Discovery sem jwks_uri')
  oidcJwksUriCache = { uri: doc.jwks_uri, expiresAt: now + OIDC_CACHE_MS }
  return doc.jwks_uri
}

function getJwksSet(jwksUri: string) {
  if (!jwksRemote || jwksUriLoaded !== jwksUri) {
    jwksUriLoaded = jwksUri
    jwksRemote = createRemoteJWKSet(new URL(jwksUri))
  }
  return jwksRemote
}

async function verifyKeycloakToken(token: string): Promise<KeycloakClaims> {
  const jwksUri = await resolveJwksUri()
  const jwks = getJwksSet(jwksUri)
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
  })
  return payload as KeycloakClaims
}

function extractIntegrationClientId(claims: KeycloakClaims): string | null {
  if (typeof claims.client_id === 'string' && claims.client_id.length > 0) return claims.client_id
  if (typeof claims.azp === 'string' && claims.azp.length > 0) return claims.azp
  if (typeof claims.sub === 'string' && claims.sub.startsWith('service-account-')) {
    return claims.sub.slice('service-account-'.length)
  }
  return null
}

function tokenScopeSet(claims: KeycloakClaims): Set<string> {
  if (typeof claims.scope !== 'string' || claims.scope.length === 0) return new Set()
  return new Set(claims.scope.split(/\s+/).filter((s) => s.length > 0))
}

function userTokenScopesSufficient(claims: KeycloakClaims): boolean {
  const granted = tokenScopeSet(claims)
  // Compatível com tokens OIDC emitidos via DCR no Keycloak/ChatGPT.
  return granted.has('email') || granted.has('profile')
}

function logAuthReject(reason: string, claims?: KeycloakClaims, details?: Record<string, unknown>) {
  const scope = typeof claims?.scope === 'string' ? claims.scope : ''
  const aud = claims?.aud
  console.warn(
    `[mcp-auth] reject: ${reason}`,
    JSON.stringify({
      sub: claims?.sub ?? null,
      azp: claims?.azp ?? null,
      client_id: claims?.client_id ?? null,
      scope,
      aud,
      expectedScopes: MCP_OAUTH_SCOPES,
      ...details,
    }),
  )
}

export async function validateMcpToken(authHeader: string | undefined): Promise<McpContext | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    logAuthReject('missing_bearer_header')
    return null
  }

  const token = authHeader.slice(7)
  let claims: KeycloakClaims
  try {
    claims = await verifyKeycloakToken(token)
  } catch (error) {
    const parts = token.split('.')
    let tokenAlg: string | null = null
    if (parts.length >= 2) {
      try {
        const headerJson = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as { alg?: string }
        tokenAlg = headerJson.alg ?? null
      } catch {
        tokenAlg = null
      }
    }
    logAuthReject('jwt_verification_failed', undefined, {
      error: error instanceof Error ? error.message : String(error),
      tokenParts: parts.length,
      tokenAlg,
    })
    return null
  }

  const sub = typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : null
  const email = typeof claims.email === 'string' && claims.email.length > 0 ? claims.email : null
  if (!sub && !email) {
    logAuthReject('missing_subject_and_email', claims)
    return null
  }

  const userWhere =
    sub && email
      ? { OR: [{ keycloakSub: sub }, { email }] }
      : sub
        ? { keycloakSub: sub }
        : { email: email! }

  const userRecord = await prisma.user.findFirst({
    where: userWhere,
    select: {
      id: true,
      familyId: true,
      role: true,
    },
  })

  if (userRecord) {
    if (!userTokenScopesSufficient(claims)) {
      logAuthReject('insufficient_user_scopes', claims)
      return null
    }
    // ChatGPT pode concluir o code flow com tokens sem `aud` consistente em alguns cenários de DCR.
    // Mantemos assinatura/issuer/scope obrigatórios para utilizadores e não bloqueamos por audience aqui.
    return {
      principalType: 'user',
      principalId: userRecord.id,
      userId: userRecord.id,
      familyId: userRecord.familyId,
      role: userRecord.role as 'ADMIN' | 'MEMBER',
    }
  }

  const clientId = extractIntegrationClientId(claims)
  if (!clientId) {
    logAuthReject('client_id_not_resolved', claims)
    return null
  }

  const record = await prisma.integrationClient.findFirst({
    where: { keycloakClientId: clientId, revokedAt: null, status: 'ACTIVE' },
    select: {
      id: true,
      familyId: true,
      createdById: true,
      role: true,
      name: true,
    },
  })

  if (!record) {
    logAuthReject('integration_client_not_found_or_inactive', claims)
    return null
  }

  prisma.integrationClient
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return {
    principalType: 'integration',
    principalId: record.id,
    userId: record.createdById,
    familyId: record.familyId,
    role: record.role as 'ADMIN' | 'MEMBER',
    integrationName: record.name,
  }
}
