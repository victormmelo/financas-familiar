'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'

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
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="max-w-md rounded-xl border border-border bg-card px-6 py-5 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">Nao foi possivel sincronizar sua sessao.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Volte para a tela de login e tente novamente.
        </p>
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
