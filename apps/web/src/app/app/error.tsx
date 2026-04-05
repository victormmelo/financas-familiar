'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <div>
        <p className="text-lg font-semibold">Algo deu errado</p>
        <p className="text-sm text-muted-foreground mt-1">
          Ocorreu um erro inesperado. Tente novamente.
        </p>
      </div>
      <Button variant="outline" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  )
}
