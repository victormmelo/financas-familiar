'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

function LoginContent() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/app/dashboard'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>
          Entre com a mesma conta que você usa no acesso seguro ao app — seus dados continuam protegidos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          className="w-full"
          onClick={() => void signIn('keycloak', { callbackUrl })}
        >
          Continuar
        </Button>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <p className="text-center text-sm text-muted-foreground">
          Primeiro acesso? Após o login você poderá{' '}
          <Link href="/auth/bootstrap" className="font-medium text-[#7CFC98] hover:underline">
            criar sua família
          </Link>
          .
        </p>
      </CardFooter>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Carregando…</CardContent>
        </Card>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
