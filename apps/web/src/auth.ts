import NextAuth from 'next-auth'
import Keycloak from 'next-auth/providers/keycloak'

const issuer = process.env.AUTH_KEYCLOAK_ISSUER ?? ''
const clientId = process.env.AUTH_KEYCLOAK_ID ?? ''
const clientSecret = process.env.AUTH_KEYCLOAK_SECRET?.trim() || undefined

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
    jwt({ token, account }) {
      const accessTokenRaw = typeof account?.access_token === 'string' ? account.access_token : null
      const idTokenRaw = typeof account?.id_token === 'string' ? account.id_token : null
      const oidcToken = account ? selectOidcToken(account) : undefined

      if (account) {
        if (oidcToken) {
          token.accessToken = oidcToken
        }
      }
      return token
    },
    session({ session, token }) {
      if (typeof token.accessToken === 'string') {
        session.accessToken = token.accessToken
      }
      return session
    },
  },
})
