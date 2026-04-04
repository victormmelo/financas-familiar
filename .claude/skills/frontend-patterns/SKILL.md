---
name: frontend-patterns
description: Usar ao criar componentes, páginas, hooks ou qualquer código frontend. Inclui regras de reutilização, shadcn/ui e organização.
---

# Frontend Patterns — Família Finance

## Checklist ANTES de criar qualquer componente

1. Existe em `components/ui/` (shadcn)? → USE
2. Existe em `components/forms/`, `components/charts/` ou `components/layout/`? → USE ou ESTENDA
3. Existe em `packages/ui/`? → USE
4. Só então crie — e coloque na pasta certa

## Estendendo shadcn/ui (não edite os arquivos em components/ui/)
```typescript
// ✅ Crie um wrapper em components/forms/ ou components/layout/
// components/forms/CurrencyInput.tsx
import { Input } from '@/components/ui/input'
import { forwardRef } from 'react'

interface CurrencyInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  currency?: string
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ currency = 'BRL', ...props }, ref) => {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {currency}
        </span>
        <Input ref={ref} className="pl-12" {...props} />
      </div>
    )
  }
)
CurrencyInput.displayName = 'CurrencyInput'
```

## Estrutura de página (App Router)
```typescript
// app/app/transacoes/page.tsx — Server Component por padrão
import { TransacoesClient } from './_components/TransacoesClient'

// Dados iniciais no servidor (sem loading state)
export default async function TransacoesPage() {
  return <TransacoesClient />
}

// app/app/transacoes/_components/TransacoesClient.tsx — Client Component
'use client'
import { useTransacoes } from '@/hooks/useTransacoes'

export function TransacoesClient() {
  const { data, isLoading } = useTransacoes()
  // ...
}
```

## Hook de dados (TanStack Query)
```typescript
// hooks/useTransacoes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Transaction, CreateTransactionInput } from '@financas/shared-types'

export function useTransacoes(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api.get<Transaction[]>('/transactions', { params: filters }),
  })
}

export function useCreateTransacao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTransactionInput) =>
      api.post<Transaction>('/transactions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] }) // saldo muda
    },
  })
}
```

## Formulário com React Hook Form + Zod
```typescript
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const schema = z.object({
  description: z.string().min(1, 'Descrição obrigatória'),
  amount: z.number({ invalid_type_error: 'Valor inválido' }).positive('Deve ser positivo'),
})

type FormValues = z.infer<typeof schema>

export function TransacaoForm({ onSuccess }: { onSuccess: () => void }) {
  const { mutate, isPending } = useCreateTransacao()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutate(data, { onSuccess }))}>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </form>
    </Form>
  )
}
```

## Zustand — apenas UI state
```typescript
// stores/ui.store.ts
import { create } from 'zustand'

interface UIStore {
  sidebarOpen: boolean
  toggleSidebar: () => void
  activeModal: string | null
  openModal: (id: string) => void
  closeModal: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  activeModal: null,
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
}))
```

## Onde colocar cada coisa
| O quê | Onde |
|---|---|
| Componente shadcn original | `components/ui/` (não editar) |
| Wrapper/extensão de shadcn | `components/ui/` com nome próprio ou pasta específica |
| Formulário de domínio | `components/forms/` |
| Gráfico Recharts | `components/charts/` |
| Header, Sidebar, Shell | `components/layout/` |
| Componente específico de uma rota | `app/.../\_components/` |
| Hook de dados (TanStack Query) | `hooks/use{Entidade}.ts` |
| Hook de UI | `hooks/use{Comportamento}.ts` |
| Estado de UI global | `stores/{dominio}.store.ts` |
| Cliente HTTP | `lib/api.ts` |
| Formatadores, helpers | `lib/utils.ts` |
