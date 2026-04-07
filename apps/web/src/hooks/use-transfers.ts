import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Transfer {
  id: string
  amount: number
  description?: string
  date: string
  fromAccountId: string
  toAccountId: string
  fromAccount?: { id: string; name: string }
  toAccount?: { id: string; name: string }
  createdAt: string
}

export interface TransferFilters {
  page?: number
  limit?: number
  fromAccountId?: string
  toAccountId?: string
  startDate?: string
  endDate?: string
}

export interface TransferListResponse {
  data: Transfer[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface TransferListApiBody {
  data: Transfer[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

function normalizeAmount(amount: Transfer['amount']): number {
  if (typeof amount === 'number' && !Number.isNaN(amount)) return amount
  const n = Number(amount)
  return Number.isFinite(n) ? n : 0
}

export function useTransfers(filters: TransferFilters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v))
  })
  const qs = params.toString()

  return useQuery({
    queryKey: ['transfers', filters],
    queryFn: async () => {
      const raw = await api.get<TransferListApiBody>(`/transfers${qs ? `?${qs}` : ''}`)
      return {
        data: raw.data.map((t) => ({ ...t, amount: normalizeAmount(t.amount) })),
        total: raw.pagination.total,
        page: raw.pagination.page,
        limit: raw.pagination.limit,
        totalPages: raw.pagination.pages,
      } satisfies TransferListResponse
    },
  })
}

export function useCreateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { fromAccountId: string; toAccountId: string; amount: number; description?: string; date: string }) =>
      api.post<Transfer>('/transfers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
