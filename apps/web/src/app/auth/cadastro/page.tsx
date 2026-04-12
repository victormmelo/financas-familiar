'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Cadastro por senha foi substituído por OIDC + `/auth/bootstrap`. */
export default function CadastroRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/auth/bootstrap')
  }, [router])
  return (
    <p className="text-center text-sm text-muted-foreground">
      Redirecionando para criação da família…
    </p>
  )
}
