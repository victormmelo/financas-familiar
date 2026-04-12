'use client'

import { useEffect, useRef } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { ApiClientError, api, setAccessToken } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

interface MeUser {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  familyId: string
  family: { id: string; name: string }
}

/** Sincroniza access token OIDC e perfil Prisma (`GET /auth/me`) com o store. */
export function SessionSync() {
  const { data: session, status } = useSession()
  const sessionAccessToken =
    typeof (session as { accessToken?: unknown } | null)?.accessToken === 'string'
      ? ((session as { accessToken?: string }).accessToken ?? null)
      : null
  const pathname = usePathname()
  const router = useRouter()
  const lastBootstrapTokenRef = useRef<string | null>(null)
  const setUser = useAuthStore((s) => s.setUser)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const setBootstrapStatus = useAuthStore((s) => s.setBootstrapStatus)
  const setHasSessionToken = useAuthStore((s) => s.setHasSessionToken)

  useEffect(() => {
    const callbackUrl = pathname?.startsWith('/app') ? pathname : '/app/dashboard'

    if (status === 'loading') {
      setBootstrapStatus('loading')
      return
    }

    if (status === 'unauthenticated') {
      lastBootstrapTokenRef.current = null
      setAccessToken(null)
      setHasSessionToken(false)
      clearAuth()
      setBootstrapStatus('idle')
      if (pathname?.startsWith('/app')) {
        router.replace(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
      }
      return
    }
    if (status !== 'authenticated' || !sessionAccessToken) {
      lastBootstrapTokenRef.current = null
      setBootstrapStatus('error')
      return
    }

    if (lastBootstrapTokenRef.current === sessionAccessToken) {
      return
    }

    setBootstrapStatus('loading')
    setHasSessionToken(true)
    setAccessToken(sessionAccessToken)
    lastBootstrapTokenRef.current = sessionAccessToken

    let cancelled = false
    void (async () => {
      try {
        const body = await api.get<{ data: MeUser | null }>('/auth/me')
        if (cancelled) return
        const u = body.data
        if (u) {
          setUser({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            familyId: u.familyId,
            familyName: u.family.name,
          })
          setBootstrapStatus('ready')
          if (pathname?.startsWith('/auth/bootstrap')) {
            router.replace('/app/dashboard')
          }
        } else {
          clearAuth()
          setBootstrapStatus('ready')
          const skipRedirect =
            pathname?.startsWith('/auth/bootstrap') || pathname?.startsWith('/auth/aceitar-convite')
          if (!skipRedirect) {
            router.replace('/auth/bootstrap')
          }
        }
      } catch (error) {
        if (cancelled) return

        if (error instanceof ApiClientError && error.status === 403 && error.code === 'USER_NOT_PROVISIONED') {
          clearAuth()
          setBootstrapStatus('ready')
          const skipRedirect =
            pathname?.startsWith('/auth/bootstrap') || pathname?.startsWith('/auth/aceitar-convite')
          if (!skipRedirect) {
            router.replace('/auth/bootstrap')
          }
          return
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setAccessToken(null)
          setHasSessionToken(false)
          clearAuth()
          setBootstrapStatus('error')
          lastBootstrapTokenRef.current = sessionAccessToken
          if (pathname?.startsWith('/app')) {
            await signOut({ redirect: false })
            router.replace(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
          }
          return
        }

        clearAuth()
        setBootstrapStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    status,
    sessionAccessToken,
    pathname,
    router,
    setUser,
    clearAuth,
    setBootstrapStatus,
    setHasSessionToken,
  ])

  return null
}
