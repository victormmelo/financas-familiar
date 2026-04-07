import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateMcpTokenInput, McpTokenCreated, McpTokenListItem } from '@financas/shared-types'

export function useMcpTokens() {
  return useQuery({
    queryKey: ['mcp-tokens'],
    queryFn: async () => {
      const res = await api.get<{ data: McpTokenListItem[] }>('/mcp-tokens')
      return res.data
    },
  })
}

export function useCreateMcpToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateMcpTokenInput) => {
      const res = await api.post<{ data: McpTokenCreated }>('/mcp-tokens', input)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-tokens'] }),
  })
}

export function useRevokeMcpToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/mcp-tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-tokens'] }),
  })
}

export function useRevealMcpToken() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.get<{ data: { token: string } }>(`/mcp-tokens/${id}/reveal`)
      return res.data.token
    },
  })
}
