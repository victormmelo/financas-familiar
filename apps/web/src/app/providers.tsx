'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { queryClient } from '@/lib/query-client'
import { ToastProvider } from '@/components/ui/toast'
import { SessionSync } from '@/components/auth/session-sync'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth" refetchInterval={60} refetchOnWindowFocus>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SessionSync />
          {children}
        </ToastProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
