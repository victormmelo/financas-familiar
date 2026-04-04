---
name: api-contract
description: Usar ao integrar frontend com backend — cliente HTTP, autenticação, tratamento de erros, tipagem compartilhada e padrões de query/mutation
---

# API Contract — Família Finance

## Cliente HTTP (lib/api.ts)

O cliente centraliza auth, refresh automático e tratamento de erros.

```typescript
// lib/api.ts
import { useAuthStore } from '@/stores/auth.store'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface ApiOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options
  const url = new URL(path, BASE_URL)

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v))
    })
  }

  const token = useAuthStore.getState().accessToken

  const res = await fetch(url, {
    ...fetchOptions,
    credentials: 'include', // envia cookie do refresh token
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchOptions.headers,
    },
  })

  // Token expirado — tenta refresh automático
  if (res.status === 401) {
    const refreshed = await refreshToken()
    if (refreshed) return request<T>(path, options) // retry
    useAuthStore.getState().logout()
    window.location.href = '/auth/login'
    throw new Error('Sessão expirada')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new ApiError(res.status, error?.error?.code, error?.error?.message)
  }

  return res.json()
}

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return false
    const { data } = await res.json()
    useAuthStore.getState().setAccessToken(data.accessToken)
    return true
  } catch {
    return false
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export const api = {
  get: <T>(path: string, options?: ApiOptions) =>
    request<{ data: T }>(path, { ...options, method: 'GET' }).then((r) => r.data),

  post: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<{ data: T }>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    }).then((r) => r.data),

  patch: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<{ data: T }>(path, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then((r) => r.data),

  delete: <T>(path: string, options?: ApiOptions) =>
    request<{ data: T }>(path, { ...options, method: 'DELETE' }).then((r) => r.data),
}
```

## Tipagem compartilhada

Tipos de request/response SEMPRE de `packages/shared-types`:
```typescript
// ✅ Correto
import type { Transaction, CreateTransactionInput } from '@financas/shared-types'

// ❌ Nunca recriar o tipo no frontend
interface Transaction { ... } // PROIBIDO se já existe em shared-types
```

## Tratamento de erro nas mutations
```typescript
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'

export function useCreateTransacao() {
  return useMutation({
    mutationFn: (data: CreateTransactionInput) =>
      api.post<Transaction>('/transactions', data),
    onSuccess: () => {
      toast.success('Transação criada')
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.status === 422) toast.error('Dados inválidos: ' + error.message)
        else if (error.status === 403) toast.error('Sem permissão')
        else toast.error('Erro ao salvar. Tente novamente.')
      }
    },
  })
}
```

## Query keys — convenção
```typescript
// Sempre arrays hierárquicos para invalidação precisa
['transactions']                          // lista geral
['transactions', { status: 'DRAFT' }]    // lista com filtro
['transactions', id]                      // item específico
['accounts']
['accounts', accountId, 'balance']
['credit-cards', cardId, 'invoices']
['reports', { month: '2025-01' }]
```

## Paginação cursor-based
```typescript
export function useTransacoes() {
  return useInfiniteQuery({
    queryKey: ['transactions'],
    queryFn: ({ pageParam }) =>
      api.get<{ data: Transaction[]; meta: PaginationMeta }>('/transactions', {
        params: { cursor: pageParam, limit: 20 },
      }),
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.nextCursor : undefined,
    initialPageParam: undefined,
  })
}
```

## Segurança
- Access token NUNCA em localStorage — apenas memória (Zustand)
- Refresh token apenas em httpOnly cookie — nunca acessível via JS
- Nunca logar tokens no console
- Em Server Components, nunca passar token para o client via props
