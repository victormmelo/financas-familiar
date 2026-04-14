import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    /** Definido quando o refresh OIDC falhou; o cliente deve encerrar a sessão. */
    error?: string
    user: DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
    oidcRefreshToken?: string
    /** Unix timestamp (segundos) em que o access token OIDC expira. */
    oidcExpiresAtSec?: number
    error?: string
  }
}
