'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const registerSchema = z.object({
  familyName: z.string().min(2, 'Nome da família muito curto'),
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})

type RegisterInput = z.infer<typeof registerSchema>

export default function CadastroPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

  async function onSubmit(data: RegisterInput) {
    try {
      const res = await api.post<{ user: { id: string; name: string; email: string; role: 'ADMIN' | 'MEMBER'; familyId: string; family?: { name: string } }; accessToken: string }>(
        '/auth/register',
        data,
      )
      setAuth(
        {
          id: res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
          familyId: res.user.familyId,
          familyName: data.familyName,
        },
        res.accessToken,
      )
      toast('Família criada com sucesso!', 'success')
      router.push('/app/dashboard')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao criar conta', 'error')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar sua família</CardTitle>
        <CardDescription>Você será o administrador da família</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="familyName">Nome da Família</Label>
            <Input
              id="familyName"
              placeholder="Família Silva"
              error={errors.familyName?.message}
              {...register('familyName')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Seu Nome</Label>
            <Input
              id="name"
              placeholder="João Silva"
              error={errors.name?.message}
              {...register('name')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="voce@exemplo.com"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              error={errors.password?.message}
              {...register('password')}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            Criar Família
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Já tem uma conta?{' '}
            <Link href="/auth/login" className="text-[#7CFC98] hover:underline font-medium">
              Entrar
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
