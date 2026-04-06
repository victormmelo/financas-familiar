import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { BudgetMonthlySummary } from '@financas/shared-types'

export function useBudgetSummary(params?: { month?: number; year?: number }) {
  return useQuery({
    queryKey: ['budgets', 'monthly-summary', params],
    queryFn: () =>
      api.get<BudgetMonthlySummary>('/budgets/monthly-summary', {
        params: params as Record<string, string | number | boolean | undefined>,
      }),
  })
}
