import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TransactionNature, TransactionRecognition } from '@financas/shared-types'

export interface Transaction {
  id: string
  type: 'INCOME' | 'EXPENSE'
  nature?: TransactionNature
  linkedTransactionId?: string | null
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
  creditCardId?: string | null
  creditCard?: { id: string; name: string } | null
  recognition?: TransactionRecognition
  creditCardInvoiceId?: string | null
  transferId?: string | null
  transfer?: {
    id: string
    fromAccountId: string
    toAccountId: string
    fromAccount?: { id: string; name: string }
    toAccount?: { id: string; name: string }
  } | null
  linkedTransaction?: {
    id: string
    type: 'INCOME' | 'EXPENSE'
    nature: TransactionNature
    status: 'DRAFT' | 'CONFIRMED' | 'DELETED'
    amount: number
    categoryId: string | null
    description: string
    category?: { id: string; name: string; type: 'INCOME' | 'EXPENSE' | 'BOTH' }
  } | null
  reimbursedAmount?: number
  remainingReimbursableAmount?: number
  netAmount?: number
  creditCardInvoice?: {
    id: string
    referenceMonth: number
    referenceYear: number
    creditCard?: { id: string; name: string }
  } | null
  createdById: string
  createdAt: string
  isRecurring: boolean
  rrule?: string | null
  recurringTemplateId?: string | null
  installmentGroupId?: string | null
  installmentIndex?: number | null
  installmentCount?: number | null
  nextOccurrences?: string[]
  liquidated?: boolean
}

export interface ReimbursementContext {
  transaction: Transaction
  reimbursements: Transaction[]
  suggested: {
    type: 'INCOME' | 'EXPENSE'
    categoryId: string | null
  }
}

export interface TransactionFilters {
  page?: number
  limit?: number
  accountId?: string
  categoryId?: string
  type?: 'INCOME' | 'EXPENSE'
  nature?: TransactionNature
  linkedTransactionId?: string
  status?: 'DRAFT' | 'CONFIRMED' | 'DELETED'
  startDate?: string
  endDate?: string
  isRecurring?: boolean
  liquidated?: boolean
  enabled?: boolean
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
    if (k === 'enabled') return
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
    enabled: filters.enabled ?? true,
  })
}

/** Lista os templates de transações recorrentes da família. */
export function useRecurringTemplates() {
  return useQuery({
    queryKey: ['transactions', 'recurring'],
    queryFn: () => api.get<Transaction[]>('/transactions/recurring'),
  })
}

export interface CreateTransactionPayload {
  accountId?: string
  categoryId?: string
  type: string
  nature?: TransactionNature
  linkedTransactionId?: string
  reimbursementOverflowReason?: string
  amount: number
  description: string
  notes?: string
  date: string
  source?: string
  creditCardId?: string
  isRecurring?: boolean
  rrule?: string
  installmentCount?: number
  liquidated?: boolean
  confirmed?: boolean
}

export function useReimbursementContext(transactionId?: string, enabled = true) {
  return useQuery({
    queryKey: ['transactions', 'reimbursement-context', transactionId],
    queryFn: () =>
      api.get<ReimbursementContext>(`/transactions/${transactionId as string}/reimbursement-context`),
    enabled: enabled && !!transactionId,
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTransactionPayload) => api.post<Transaction>('/transactions', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['credit-cards'] })
    },
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string
      categoryId?: string | null
      nature?: TransactionNature
      linkedTransactionId?: string | null
      reimbursementOverflowReason?: string
      amount?: number
      description?: string
      notes?: string | null
      date?: string
      liquidated?: boolean
      accountId?: string
    }) => api.patch<Transaction>(`/transactions/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['credit-cards'] })
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

export function useRestoreTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Transaction>(`/transactions/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function usePermanentlyDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}/permanent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useEmptyTransactionTrash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ deleted: number }>('/transactions/trash/empty'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

/** Cancela um template recorrente e seus drafts futuros. */
export function useCancelRecurringTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => api.delete(`/transactions/recurring/${templateId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
