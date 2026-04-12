'use client'

import { Suspense, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const schema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
})

type Form = z.infer<typeof schema>

function AceitarConviteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { status } = useSession()
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (status === 'unauthenticated') {
      const next = token ? `/auth/aceitar-convite?token=${encodeURIComponent(token)}` : '/auth/aceitar-convite'
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent(next)}`)
    }
  }, [status, router, token])

  async function onSubmit(data: Form) {
    if (!token) {
      toast('Link de convite inválido (sem token).', 'error')
      return
    }
    try {
      await api.post<{ data: { user: { id: string } } }>(`/auth/accept-invite/${encodeURIComponent(token)}`, {
        name: data.name,
      })
      toast('Convite aceito! Bem-vindo.', 'success')
      router.push('/app/dashboard')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao aceitar convite', 'error')
    }
  }

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Convite inválido</CardTitle>
          <CardDescription>Use o link enviado por e-mail.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (status === 'loading') {
    return <p className="text-center text-sm text-muted-foreground">Carregando sessão…</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aceitar convite</CardTitle>
        <CardDescription>
          Entre com a mesma conta (e-mail) do convite. Se ainda não estiver logado, faça login com Keycloak.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Seu nome</Label>
            <Input id="name" placeholder="Como quer ser chamado" error={errors.name?.message} {...register('name')} />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            Aceitar e entrar
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function AceitarConvitePage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Carregando…</CardContent>
        </Card>
      }
    >
      <AceitarConviteInner />
    </Suspense>
  )
}
