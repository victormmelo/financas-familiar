import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Transaction {
  id: string
  type: 'INCOME' | 'EXPENSE'
  status: 'DRAFT' | 'CONFIRMED' | 'DELETED'
  amount: number
  description: string
  notes?: string
  date: string
  source: string
  accountId: string
  account?: { id: string; name: string }
  categoryId?: string
  category?: { id: string; name: string; color?: string }
  createdById: string
  createdAt: string
}

export interface TransactionFilters {
  page?: number
  limit?: number
  accountId?: string
  categoryId?: string
  type?: 'INCOME' | 'EXPENSE'
  status?: 'DRAFT' | 'CONFIRMED' | 'DELETED'
  startDate?: string
  endDate?: string
}

export interface TransactionListResponse {
  data: Transaction[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/** Formato bruto da API (`apps/api` — transactions.service listTransactions). */
interface TransactionListApiBody {
  data: Transaction[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

function normalizeAmount(amount: Transaction['amount']): number {
  if (typeof amount === 'number' && !Number.isNaN(amount)) return amount
  const n = Number(amount)
  return Number.isFinite(n) ? n : 0
}

export function useTransactions(filters: TransactionFilters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v))
  })
  const qs = params.toString()

  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      const raw = await api.get<TransactionListApiBody>(`/transactions${qs ? `?${qs}` : ''}`)
      return {
        data: raw.data.map((t) => ({ ...t, amount: normalizeAmount(t.amount) })),
        total: raw.pagination.total,
        page: raw.pagination.page,
        limit: raw.pagination.limit,
        totalPages: raw.pagination.pages,
      } satisfies TransactionListResponse
    },
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      accountId: string
      categoryId?: string
      type: string
      amount: number
      description: string
      notes?: string
      date: string
      source?: string
    }) => api.post<Transaction>('/transactions', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; categoryId?: string | null; amount?: number; description?: string; notes?: string | null; date?: string }) =>
      api.patch<Transaction>(`/transactions/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useConfirmTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/transactions/${id}/confirm`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useBulkConfirmTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/transactions/bulk-confirm', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useBulkSetTransactionCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { ids: string[]; categoryId: string | null }) =>
      api.post<{ updated: number }>('/transactions/bulk-set-category', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
