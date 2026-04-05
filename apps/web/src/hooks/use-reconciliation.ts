'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiFetchMultipart } from '@/lib/api'
import type {
  StatementItem,
  StatementItemFilters,
  CreateStatementItemInput,
  RunMatchingInput,
  AcceptMatchInput,
  ConvertItemInput,
  BalanceReconciliation,
} from '@financas/shared-types'

interface ListStatementItemsResponse {
  data: StatementItem[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

interface ImportResult {
  data: {
    session: { id: string; fileName: string | null; source: string }
    total: number
    created: number
    skipped: number
    matched: number
  }
}

interface MatchResult {
  data: { matched: number; unmatched: number; total: number }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useStatementItems(filters: StatementItemFilters = {}) {
  const params = new URLSearchParams()
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.accountId) params.set('accountId', filters.accountId)
  if (filters.sessionId) params.set('sessionId', filters.sessionId)
  if (filters.status) params.set('status', filters.status)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)

  const qs = params.toString()

  return useQuery({
    queryKey: ['reconciliation-items', filters],
    queryFn: () =>
      api.get<ListStatementItemsResponse>(`/reconciliation/items${qs ? `?${qs}` : ''}`),
  })
}

export function useBalanceSummary(
  accountId: string | undefined,
  reportedBalance: number | undefined,
) {
  return useQuery({
    queryKey: ['reconciliation-balance', accountId, reportedBalance],
    queryFn: () =>
      api.get<{ data: BalanceReconciliation }>(
        `/reconciliation/balance/${accountId}?reportedBalance=${reportedBalance}`,
      ),
    enabled: !!accountId && reportedBalance !== undefined,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useImportStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiFetchMultipart<ImportResult>('/reconciliation/import', formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] })
    },
  })
}

export function useCreateStatementItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStatementItemInput) =>
      api.post<StatementItem>('/reconciliation/items', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] })
    },
  })
}

export function useDeleteStatementItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/reconciliation/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] })
    },
  })
}

export function useRunMatching() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RunMatchingInput) =>
      api.post<MatchResult>('/reconciliation/match', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] })
    },
  })
}

export function useAcceptMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: AcceptMatchInput & { id: string }) =>
      api.patch<StatementItem>(`/reconciliation/items/${id}/accept-match`, {
        transactionId: input.transactionId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] })
    },
  })
}

export function useRejectMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch<StatementItem>(`/reconciliation/items/${id}/reject-match`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] })
    },
  })
}

export function useIgnoreItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch<StatementItem>(`/reconciliation/items/${id}/ignore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] })
    },
  })
}

export function useConvertItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: ConvertItemInput & { id: string }) =>
      api.post(`/reconciliation/items/${id}/convert`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
