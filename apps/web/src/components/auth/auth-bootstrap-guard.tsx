'use client'

import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'

function AppBootstrapLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="rounded-xl border border-border bg-card px-6 py-5 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">Preparando sua sessão…</p>
        <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
          Sincronizando autenticação
        </p>
      </div>
    </div>
  )
}

function AppBootstrapError() {
  const router = useRouter()
  const requestSessionSyncRetry = useAuthStore((s) => s.requestSessionSyncRetry)

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="max-w-md space-y-4 rounded-xl border border-border bg-card px-6 py-5 text-center shadow-sm">
        <div>
          <p className="text-sm font-medium text-foreground">Não foi possível sincronizar sua sessão.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Verifique se a API está no ar e se o endereço em <code className="text-xs">NEXT_PUBLIC_API_URL</code>{' '}
            aponta para o backend acessível pelo navegador.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" variant="secondary" onClick={() => requestSessionSyncRetry()}>
            Tentar novamente
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/auth/login')}>
            Ir para o login
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AuthBootstrapGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus)
  const user = useAuthStore((s) => s.user)
  const hasSessionToken = useAuthStore((s) => s.hasSessionToken)

  if (!pathname.startsWith('/app')) return <>{children}</>

  const isReady = bootstrapStatus === 'ready' && hasSessionToken && !!user
  if (!isReady) {
    if (bootstrapStatus === 'error') {
      return <AppBootstrapError />
    }
    return <AppBootstrapLoading />
  }

  return <>{children}</>
}
