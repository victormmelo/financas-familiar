import NextAuth from 'next-auth'
import Keycloak from 'next-auth/providers/keycloak'

const issuer = process.env.AUTH_KEYCLOAK_ISSUER ?? ''
const clientId = process.env.AUTH_KEYCLOAK_ID ?? ''
const clientSecret = process.env.AUTH_KEYCLOAK_SECRET?.trim() || undefined

/** Renovar o access token ~90s antes do exp (skew de relógio). */
const ACCESS_REFRESH_BUFFER_MS = 90_000

function isJwt(value: unknown): value is string {
  return typeof value === 'string' && value.split('.').length === 3
}

function decodeBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    const padLen = (4 - (normalized.length % 4)) % 4
    const padded = `${normalized}${'='.repeat(padLen)}`
    return atob(padded)
  } catch {
    return null
  }
}

function readJwtSub(token: string): string | null {
  const chunks = token.split('.')
  if (chunks.length !== 3) return null
  const payloadRaw = decodeBase64Url(chunks[1])
  if (!payloadRaw) return null
  try {
    const payload = JSON.parse(payloadRaw) as { sub?: unknown }
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null
  } catch {
    return null
  }
}

function readJwtExpSec(token: string): number | null {
  const chunks = token.split('.')
  if (chunks.length !== 3) return null
  const payloadRaw = decodeBase64Url(chunks[1])
  if (!payloadRaw) return null
  try {
    const payload = JSON.parse(payloadRaw) as { exp?: unknown }
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null
  } catch {
    return null
  }
}

function selectOidcToken(account: { access_token?: unknown; id_token?: unknown }): string | undefined {
  if (isJwt(account.access_token) && readJwtSub(account.access_token)) {
    return account.access_token
  }
  if (isJwt(account.id_token) && readJwtSub(account.id_token)) {
    return account.id_token
  }
  if (isJwt(account.access_token)) {
    return account.access_token
  }
  if (isJwt(account.id_token)) {
    return account.id_token
  }
  if (typeof account.access_token === 'string' && account.access_token.length > 0) {
    return account.access_token
  }
  if (typeof account.id_token === 'string' && account.id_token.length > 0) {
    return account.id_token
  }
  return undefined
}

function keycloakTokenUrl(): string {
  const base = issuer.replace(/\/+$/, '')
  return `${base}/protocol/openid-connect/token`
}

async function refreshKeycloakAccessToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAtSec: number
} | null> {
  if (!issuer || !clientId) return null

  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', refreshToken)
  body.set('client_id', clientId)
  if (clientSecret) {
    body.set('client_secret', clientSecret)
  }

  const res = await fetch(keycloakTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) return null

  const json = (await res.json()) as {
    access_token?: unknown
    id_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
  }

  const accessToken = selectOidcToken({
    access_token: json.access_token,
    id_token: json.id_token,
  })
  if (!accessToken) return null

  const nextRefresh =
    typeof json.refresh_token === 'string' && json.refresh_token.length > 0 ? json.refresh_token : refreshToken
  const expiresIn =
    typeof json.expires_in === 'number' && Number.isFinite(json.expires_in) ? json.expires_in : 60
  const expiresAtSec = Math.floor(Date.now() / 1000) + expiresIn

  return {
    accessToken,
    refreshToken: nextRefresh,
    expiresAtSec,
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: '/api/auth',
  providers: [
    Keycloak({
      issuer,
      clientId,
      ...(clientSecret ? { clientSecret } : {}),
      client: clientSecret ? undefined : { token_endpoint_auth_method: 'none' },
      authorization: { params: { scope: 'openid email profile' } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        delete token.error
        const oidcToken = selectOidcToken(account)
        if (oidcToken) {
          token.accessToken = oidcToken
        }

        const rt = account.refresh_token
        if (typeof rt === 'string' && rt.length > 0) {
          token.oidcRefreshToken = rt
        }

        let expSec: number | undefined =
          typeof account.expires_at === 'number' && Number.isFinite(account.expires_at)
            ? account.expires_at
            : undefined
        if (expSec === undefined && typeof token.accessToken === 'string') {
          expSec = readJwtExpSec(token.accessToken) ?? undefined
        }
        if (expSec !== undefined) {
          token.oidcExpiresAtSec = expSec
        }

        return token
      }

      const refreshTok =
        typeof token.oidcRefreshToken === 'string' && token.oidcRefreshToken.length > 0
          ? token.oidcRefreshToken
          : null

      let expSec = typeof token.oidcExpiresAtSec === 'number' ? token.oidcExpiresAtSec : 0
      if (expSec === 0 && typeof token.accessToken === 'string') {
        const fromJwt = readJwtExpSec(token.accessToken)
        if (fromJwt !== null) {
          expSec = fromJwt
          token.oidcExpiresAtSec = expSec
        }
      }

      const isExpiredOrNear =
        expSec === 0 || Date.now() >= expSec * 1000 - ACCESS_REFRESH_BUFFER_MS

      if (!isExpiredOrNear) {
        return token
      }

      if (!refreshTok) {
        return token
      }

      try {
        const refreshed = await refreshKeycloakAccessToken(refreshTok)
        if (!refreshed) {
          return {
            ...token,
            error: 'RefreshAccessTokenError',
            accessToken: undefined,
            oidcRefreshToken: undefined,
            oidcExpiresAtSec: undefined,
          }
        }
        delete token.error
        token.accessToken = refreshed.accessToken
        token.oidcRefreshToken = refreshed.refreshToken
        token.oidcExpiresAtSec = refreshed.expiresAtSec
        return token
      } catch {
        return {
          ...token,
          error: 'RefreshAccessTokenError',
          accessToken: undefined,
          oidcRefreshToken: undefined,
          oidcExpiresAtSec: undefined,
        }
      }
    },
    session({ session, token }) {
      if (typeof token.accessToken === 'string') {
        session.accessToken = token.accessToken
      } else {
        session.accessToken = undefined
      }
      session.error = typeof token.error === 'string' ? token.error : undefined
      return session
    },
  },
})
