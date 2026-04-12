/** Claims mínimas do access token OIDC (Keycloak) usadas pelo domínio de auth. */
export type KeycloakAccessClaims = {
  sub: string
  email?: string
  preferred_username?: string
  email_verified?: boolean
  azp?: string
  client_id?: string
  aud?: string | string[]
  typ?: string
}

export function resolveEmailFromClaims(claims: KeycloakAccessClaims): string | null {
  const raw = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
  if (raw.length > 0) return raw
  const pu = typeof claims.preferred_username === 'string' ? claims.preferred_username.trim() : ''
  if (pu.includes('@')) return pu.toLowerCase()
  return null
}
