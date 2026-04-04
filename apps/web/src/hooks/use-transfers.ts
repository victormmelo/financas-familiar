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

export function useTransfers() {
  return useQuery({
    queryKey: ['transfers'],
    queryFn: () => api.get<Transfer[]>('/transfers'),
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
