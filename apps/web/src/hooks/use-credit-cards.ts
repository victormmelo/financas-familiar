import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface CreditCard {
  id: string
  name: string
  limit: number
  closingDay: number
  dueDay: number
  defaultAccountId: string | null
  defaultAccount?: { id: string; name: string } | null
  color?: string
  icon?: string
  isActive: boolean
  currentSpending?: number
  openInvoice?: CreditCardInvoice
}

export interface InvoiceTransaction {
  id: string
  type: 'INCOME' | 'EXPENSE'
  status: 'DRAFT' | 'CONFIRMED' | 'DELETED'
  amount: number
  description: string
  date: string
  category?: { id: string; name: string; type: string } | null
}

export interface CreditCardInvoice {
  id: string
  creditCardId: string
  referenceMonth: number
  referenceYear: number
  totalAmount: number
  status: 'OPEN' | 'CLOSED' | 'PARTIAL' | 'OVERDUE' | 'RENEGOTIATED' | 'PAID'
  dueDate: string
  paidAt?: string | null
  paidFromAccountId?: string | null
  manualClosedAt?: string | null
  manualReopenedAt?: string | null
  paidFromAccount?: { id: string; name: string } | null
  carriedAmount?: number
  negotiatedInstallmentAmount?: number
  paymentAmount?: number
  outstandingAmount?: number
  transactions?: InvoiceTransaction[]
}

export interface CreditCardInvoiceSettlementInstallment {
  id: string
  settlementId: string
  sequence: number
  dueReferenceMonth: number
  dueReferenceYear: number
  amount: number
  status: 'PENDING' | 'PAID' | 'CANCELLED'
  paidAt?: string | null
}

export interface CreditCardInvoiceSettlement {
  id: string
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED'
  totalOriginal: number
  downPayment: number
  negotiatedTotal: number
  installmentCount: number
  firstInstallmentMonth: number
  firstInstallmentYear: number
  installments: CreditCardInvoiceSettlementInstallment[]
}

export interface CreditCardInvoiceStatement {
  invoice: CreditCardInvoice
  breakdown: {
    cycleAmount: number
    carriedAmount: number
    negotiatedInstallmentAmount: number
    paymentAmount: number
    totalAmount: number
    outstandingAmount: number
    status: CreditCardInvoice['status']
  }
  payments: InvoiceTransaction[]
  settlement: CreditCardInvoiceSettlement | null
  events: CreditCardInvoiceEvent[]
}

export interface CreditCardInvoiceEvent {
  id: string
  action:
    | 'MANUAL_CLOSE'
    | 'MANUAL_REOPEN'
    | 'PAYMENT_CREATED'
    | 'SETTLEMENT_CREATED'
    | 'TRANSACTION_UPDATED'
    | 'TRANSACTION_DELETED'
  reason?: string | null
  createdAt: string
  actor?: { id: string; name: string } | null
  metadata?: Record<string, unknown> | null
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
    queryFn: () => api.get<{ data: CreditCardInvoice[]; pagination: { total: number; page: number; limit: number; pages: number } }>(`/credit-cards/${cardId}/invoices${qs ? `?${qs}` : ''}`),
    enabled: !!cardId,
  })
}

export function useCreditCardInvoice(cardId: string, invoiceId: string) {
  return useQuery({
    queryKey: ['credit-cards', cardId, 'invoices', invoiceId],
    queryFn: () => api.get<CreditCardInvoice>(`/credit-cards/${cardId}/invoices/${invoiceId}`),
    enabled: !!cardId && !!invoiceId,
  })
}

export function useCreateCreditCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      limit: number
      closingDay: number
      dueDay: number
      defaultAccountId: string
      color?: string
      icon?: string
    }) => api.post<CreditCard>('/credit-cards', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-cards'] }),
  })
}

export function useUpdateCreditCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string
      name?: string
      limit?: number
      closingDay?: number
      dueDay?: number
      defaultAccountId?: string | null
      color?: string
      icon?: string
      isActive?: boolean
    }) => api.patch<CreditCard>(`/credit-cards/${id}`, data),
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
      api.post(`/credit-cards/${cardId}/invoices/${invoiceId}/payments`, { accountId, amount }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['credit-cards', vars.cardId, 'invoices'] })
      qc.invalidateQueries({ queryKey: ['credit-cards', vars.cardId, 'invoices', vars.invoiceId] })
      qc.invalidateQueries({ queryKey: ['credit-cards', vars.cardId, 'invoices', vars.invoiceId, 'statement'] })
    },
  })
}

export function useCreditCardInvoiceStatement(cardId: string, invoiceId: string) {
  return useQuery({
    queryKey: ['credit-cards', cardId, 'invoices', invoiceId, 'statement'],
    queryFn: () => api.get<CreditCardInvoiceStatement>(`/credit-cards/${cardId}/invoices/${invoiceId}/statement`),
    enabled: !!cardId && !!invoiceId,
  })
}

export function useCreateInvoiceSettlement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      cardId,
      invoiceId,
      accountId,
      downPayment,
      installmentCount,
      installmentAmount,
      firstInstallmentMonth,
      firstInstallmentYear,
    }: {
      cardId: string
      invoiceId: string
      accountId: string
      downPayment?: number
      installmentCount: number
      installmentAmount: number
      firstInstallmentMonth: number
      firstInstallmentYear: number
    }) =>
      api.post<CreditCardInvoiceSettlement>(`/credit-cards/${cardId}/invoices/${invoiceId}/settlements`, {
        accountId,
        downPayment,
        installmentCount,
        installmentAmount,
        firstInstallmentMonth,
        firstInstallmentYear,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useCloseInvoiceManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, invoiceId, reason }: { cardId: string; invoiceId: string; reason?: string }) =>
      api.post(`/credit-cards/${cardId}/invoices/${invoiceId}/close`, { reason }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] })
      qc.invalidateQueries({ queryKey: ['credit-cards', vars.cardId, 'invoices'] })
      qc.invalidateQueries({ queryKey: ['credit-cards', vars.cardId, 'invoices', vars.invoiceId] })
      qc.invalidateQueries({ queryKey: ['credit-cards', vars.cardId, 'invoices', vars.invoiceId, 'statement'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useReopenInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, invoiceId, reason }: { cardId: string; invoiceId: string; reason: string }) =>
      api.post(`/credit-cards/${cardId}/invoices/${invoiceId}/reopen`, { reason }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] })
      qc.invalidateQueries({ queryKey: ['credit-cards', vars.cardId, 'invoices'] })
      qc.invalidateQueries({ queryKey: ['credit-cards', vars.cardId, 'invoices', vars.invoiceId] })
      qc.invalidateQueries({ queryKey: ['credit-cards', vars.cardId, 'invoices', vars.invoiceId, 'statement'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
