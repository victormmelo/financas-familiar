'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const bootstrapSchema = z.object({
  familyName: z.string().min(2, 'Nome da família muito curto'),
  name: z.string().optional(),
})

type BootstrapForm = z.infer<typeof bootstrapSchema>

export default function BootstrapPage() {
  const router = useRouter()
  const { status } = useSession()
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BootstrapForm>({ resolver: zodResolver(bootstrapSchema) })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login')
    }
  }, [status, router])

  async function onSubmit(data: BootstrapForm) {
    try {
      const nameTrim = data.name?.trim()
      await api.post<{ data: { user: { id: string; name: string; email: string; role: string; familyId: string } } }>(
        '/auth/bootstrap',
        {
          familyName: data.familyName,
          ...(nameTrim && nameTrim.length > 0 ? { name: nameTrim } : {}),
        },
      )
      toast('Família criada! Redirecionando…', 'success')
      router.push('/app/dashboard')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao criar família', 'error')
    }
  }

  if (status === 'loading') {
    return <p className="text-center text-sm text-muted-foreground">Carregando sessão…</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar sua família</CardTitle>
        <CardDescription>
          Você já está autenticado. Defina o nome da família para concluir o cadastro como administrador.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="familyName">Nome da família</Label>
            <Input
              id="familyName"
              placeholder="Família Silva"
              error={errors.familyName?.message}
              {...register('familyName')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Seu nome (opcional)</Label>
            <Input
              id="name"
              placeholder="Se vazio, usamos o e-mail da conta"
              error={errors.name?.message}
              {...register('name')}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            Concluir cadastro
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
