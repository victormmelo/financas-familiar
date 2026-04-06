'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { ToastProvider } from '@/components/ui/toast'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { setAccessToken } from '@/lib/api'

function AuthHydration() {
  const { user } = useAuthStore()

  useEffect(() => {
    // On mount, try to refresh if we have a stored user but no access token
    if (user) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.accessToken) {
            setAccessToken(data.accessToken)
          }
        })
        .catch(() => {})
    }
  }, [user])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthHydration />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  )
}
