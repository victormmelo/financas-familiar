import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface CreditCard {
  id: string
  name: string
  limit: number
  closingDay: number
  dueDay: number
  color?: string
  icon?: string
  isActive: boolean
  currentSpending?: number
  openInvoice?: CreditCardInvoice
}

export interface CreditCardInvoice {
  id: string
  creditCardId: string
  referenceMonth: number
  referenceYear: number
  totalAmount: number
  status: 'OPEN' | 'CLOSED' | 'PAID'
  dueDate?: string
  paidAt?: string
  paidAmount?: number
}

export function useCreditCards() {
  return useQuery({
    queryKey: ['credit-cards'],
    queryFn: () => api.get<CreditCard[]>('/credit-cards'),
  })
}

export function useCreditCardInvoices(cardId: string, params?: { page?: number; limit?: number; status?: string }) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString() : ''
  return useQuery({
    queryKey: ['credit-cards', cardId, 'invoices', params],
    queryFn: () => api.get<{ data: CreditCardInvoice[]; total: number }>(`/credit-cards/${cardId}/invoices${qs ? `?${qs}` : ''}`),
    enabled: !!cardId,
  })
}

export function useCreateCreditCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; limit: number; closingDay: number; dueDay: number; color?: string; icon?: string }) =>
      api.post<CreditCard>('/credit-cards', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-cards'] }),
  })
}

export function useUpdateCreditCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; limit?: number; closingDay?: number; dueDay?: number; color?: string; icon?: string; isActive?: boolean }) =>
      api.patch<CreditCard>(`/credit-cards/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-cards'] }),
  })
}

export function useDeleteCreditCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/credit-cards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-cards'] }),
  })
}

export function usePayInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, invoiceId, accountId, amount }: { cardId: string; invoiceId: string; accountId: string; amount?: number }) =>
      api.post(`/credit-cards/${cardId}/invoices/${invoiceId}/pay`, { accountId, amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
