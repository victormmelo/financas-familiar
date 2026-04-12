import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { prisma } from './prisma.js'
import type { McpContext } from './context.js'
import { env } from './env.js'

type KeycloakClaims = JWTPayload & {
  sub?: string
  azp?: string
  client_id?: string
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
    algorithms: ['RS256'],
  })
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Token sem sub')
  }
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

export async function validateMcpToken(authHeader: string | undefined): Promise<McpContext | null> {
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  let claims: KeycloakClaims
  try {
    claims = await verifyKeycloakToken(token)
  } catch {
    return null
  }

  const userRecord = await prisma.user.findFirst({
    where: { keycloakSub: claims.sub ?? '' },
    select: {
      id: true,
      familyId: true,
      role: true,
    },
  })

  if (userRecord) {
    return {
      principalType: 'user',
      principalId: userRecord.id,
      userId: userRecord.id,
      familyId: userRecord.familyId,
      role: userRecord.role as 'ADMIN' | 'MEMBER',
    }
  }

  const clientId = extractIntegrationClientId(claims)
  if (!clientId) return null

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

  if (!record) return null

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
