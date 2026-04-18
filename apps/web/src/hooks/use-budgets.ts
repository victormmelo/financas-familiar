import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Budget {
  id: string
  categoryId: string
  category?: { id: string; name: string; color?: string }
  referenceMonth: number
  referenceYear: number
  limitAmount: number
  grossExpense?: number
  expenseReimbursements?: number
  spentAmount: number
  remainingAmount: number
  usagePercent: number
  isOverBudget: boolean
}

export function useBudgets(params?: { referenceMonth?: number; referenceYear?: number; enabled?: boolean }) {
  const { enabled = true, ...queryParams } = params ?? {}
  const qs = new URLSearchParams(
    Object.entries(queryParams)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString()
  return useQuery({
    queryKey: ['budgets', params],
    queryFn: () => api.get<Budget[]>(`/budgets${qs ? `?${qs}` : ''}`),
    enabled,
  })
}

export function useCreateBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { categoryId: string; referenceMonth: number; referenceYear: number; limitAmount: number }) =>
      api.post<Budget>('/budgets', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export function useUpdateBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, limitAmount }: { id: string; limitAmount: number }) =>
      api.patch<Budget>(`/budgets/${id}`, { limitAmount }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/budgets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}
