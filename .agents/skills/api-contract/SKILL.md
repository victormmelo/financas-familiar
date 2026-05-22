---
name: api-contract
description: Usar ao integrar frontend com backend — cliente HTTP, autenticação, tratamento de erros, tipagem compartilhada e padrões de query/mutation
---

# API Contract — Família Finance

## Autenticação (visão geral)

- **Login**: NextAuth + provedor OIDC (Keycloak). O access token OIDC é guardado na sessão NextAuth e renovado no callback `jwt` quando há `refresh_token` (ver `apps/web/src/auth.ts`).
- **Chamadas à API Fastify**: o token em uso no browser fica em **memória** (`setAccessToken` / módulo `lib/api.ts`), preenchido pelo `SessionSync` após o login. O header é `Authorization: Bearer <access_token OIDC>`.
- **Validação no backend**: rotas protegidas verificam o JWT do Keycloak (`verifyKeycloakAccessToken`). Não existe rota `POST /auth/refresh` na API — o refresh é responsabilidade do NextAuth / IdP, não do Fastify.

## Cliente HTTP (`apps/web/src/lib/api.ts`)

O cliente envia JSON, anexa o Bearer quando há token em memória e usa `credentials: 'include'` (útil se no futuro houver cookies de mesma origem; o fluxo atual não depende de refresh via cookie na API).

```typescript
// apps/web/src/lib/api.ts (resumo do contrato)
import { setAccessToken, api, ApiClientError } from '@/lib/api'

// Token OIDC é definido pelo SessionSync após sessão NextAuth válida
setAccessToken(sessionAccessToken)

// Chamadas
const body = await api.get<MyDto>('/algum/recurso')

// Erros: ApiClientError com status e code opcional (ex.: USER_NOT_PROVISIONED em 403)
```

Comportamento em **401**:

- O cliente **zera** o token em memória e lança `ApiClientError` com `code: 'UNAUTHENTICATED'`.
- **Não** há retry automático nem segunda chamada a um endpoint de refresh na API.
- Fluxos que dependem de sessão (ex.: `SessionSync`) tratam 401 com `signOut` e redirecionamento ao login quando aplicável.

Hooks e componentes devem capturar `ApiClientError` e decidir UX (toast, redirect, invalidação de queries).

Exemplo de uso em mutation:

```typescript
import { ApiClientError } from '@/lib/api'

try {
  await api.post('/recurso', payload)
} catch (e) {
  if (e instanceof ApiClientError && e.status === 403 && e.code === 'USER_NOT_PROVISIONED') {
    // orientar conclusão de cadastro / bootstrap
  }
  if (e instanceof ApiClientError && e.status === 401) {
    // sessão inválida — em geral o SessionSync já redireciona; evitar estado inconsistente
  }
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
import { ApiClientError } from '@/lib/api'
import { useToast } from '@/components/ui/toast'

export function useCreateTransacao() {
  const { toast } = useToast()
  return useMutation({
    mutationFn: (data: CreateTransactionInput) => api.post<Transaction>('/transactions', data),
    onSuccess: () => {
      toast('Transação criada', 'success')
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
    onError: (error: unknown) => {
      if (error instanceof ApiClientError) {
        if (error.status === 403) toast(error.message, 'error')
        else toast('Erro ao salvar. Tente novamente.', 'error')
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
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ limit: '20' })
      if (pageParam) q.set('cursor', String(pageParam))
      return api.get<{ data: Transaction[]; meta: PaginationMeta }>(`/transactions?${q}`)
    },
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.nextCursor : undefined,
    initialPageParam: undefined,
  })
}
```

## Segurança

- Access token OIDC na web: exposto ao JS apenas via sessão NextAuth / memória do cliente para chamadas à API — não persistir em `localStorage` por padrão.
- Refresh OIDC: tratado no servidor NextAuth (`jwt` callback), não expor refresh token ao código de UI.
- Nunca logar tokens no console.
- Em Server Components, não passar token sensível ao client via props desnecessárias.
