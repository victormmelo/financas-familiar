import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { env } from '../env.js'
import type { KeycloakAccessClaims } from './keycloak-claims.js'

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
    throw new Error(`Falha ao obter OpenID Discovery (${res.status}): ${wellKnown}`)
  }
  const doc = (await res.json()) as { jwks_uri?: string }
  if (!doc.jwks_uri || typeof doc.jwks_uri !== 'string') {
    throw new Error('OpenID Discovery sem jwks_uri')
  }
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

function audienceMatches(payload: JWTPayload, audience: string): boolean {
  const azp = payload.azp
  if (typeof azp === 'string' && azp === audience) return true
  const aud = payload.aud
  if (Array.isArray(aud)) return aud.includes(audience)
  if (typeof aud === 'string') return aud === audience
  return false
}

export type { KeycloakAccessClaims } from './keycloak-claims.js'

/**
 * Valida access token do Keycloak (assinatura JWKS, issuer e exp).
 */
export async function verifyKeycloakAccessToken(
  token: string,
  options?: { expectedAudience?: string },
): Promise<KeycloakAccessClaims> {
  const jwksUri = await resolveJwksUri()
  const jwks = getJwksSet(jwksUri)
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    algorithms: ['RS256'],
  })

  if (options?.expectedAudience && !audienceMatches(payload, options.expectedAudience)) {
    throw new Error('Token sem audience/azp esperado para este client')
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Token sem sub')
  }
  return payload as KeycloakAccessClaims
}

export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization || !authorization.startsWith('Bearer ')) return null
  const t = authorization.slice('Bearer '.length).trim()
  return t.length > 0 ? t : null
}

export function getDefaultAudience(): string {
  return env.KEYCLOAK_AUDIENCE
}
