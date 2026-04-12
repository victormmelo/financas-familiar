import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Account {
  id: string
  name: string
  type: 'CHECKING' | 'SAVINGS' | 'JOINT' | 'INVESTMENT' | 'CASH'
  balance: number
  liquidatedBalance: number
  initialBalance: number
  color?: string
  icon?: string
  isActive: boolean
  createdAt: string
}

/** Quando ambos definidos, saldo até o fim desse mês (GET /accounts?asOfYear&asOfMonth). */
export interface UseAccountsParams {
  asOfYear?: number
  asOfMonth?: number
  enabled?: boolean
}

function normalizeAccount(a: Account): Account {
  return {
    ...a,
    balance: typeof a.balance === 'number' && !Number.isNaN(a.balance) ? a.balance : Number(a.balance) || 0,
    liquidatedBalance:
      typeof a.liquidatedBalance === 'number' && !Number.isNaN(a.liquidatedBalance)
        ? a.liquidatedBalance
        : Number(a.liquidatedBalance) || 0,
    initialBalance:
      typeof a.initialBalance === 'number' && !Number.isNaN(a.initialBalance)
        ? a.initialBalance
        : Number(a.initialBalance) || 0,
  }
}

export function useAccounts(params?: UseAccountsParams) {
  const hasAsOf = params?.asOfYear !== undefined && params?.asOfMonth !== undefined
  const qs = hasAsOf
    ? `?asOfYear=${params!.asOfYear}&asOfMonth=${params!.asOfMonth}`
    : ''

  return useQuery({
    queryKey: ['accounts', hasAsOf ? params!.asOfYear : null, hasAsOf ? params!.asOfMonth : null],
    queryFn: async () => {
      const rows = await api.get<Account[]>(`/accounts${qs}`)
      return rows.map(normalizeAccount)
    },
    enabled: params?.enabled ?? true,
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; type: string; initialBalance?: number; color?: string; icon?: string }) =>
      api.post<Account>('/accounts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; type?: string; color?: string; icon?: string; isActive?: boolean }) =>
      api.patch<Account>(`/accounts/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}
