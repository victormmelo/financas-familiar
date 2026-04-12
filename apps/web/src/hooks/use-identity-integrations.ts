import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  CreateIdentityIntegrationInput,
  IdentityClientsResponse,
  IdentityIntegrationCreated,
  IdentityIntegrationListItem,
  IdentityIntegrationRotatedSecret,
  IdentityMetadata,
  UpdateIdentityIntegrationInput,
} from '@financas/shared-types'

export function useIdentityMetadata() {
  return useQuery({
    queryKey: ['identity', 'metadata'],
    queryFn: async () => {
      const res = await api.get<{ data: IdentityMetadata }>('/identity/metadata')
      return res.data
    },
  })
}

export function useManagedIdentityClients() {
  return useQuery({
    queryKey: ['identity', 'clients'],
    queryFn: async () => {
      const res = await api.get<{ data: IdentityClientsResponse }>('/identity/clients')
      return res.data.clients
    },
  })
}

export function useIdentityIntegrations() {
  return useQuery({
    queryKey: ['identity', 'integrations'],
    queryFn: async () => {
      const res = await api.get<{ data: IdentityIntegrationListItem[] }>('/identity/integrations')
      return res.data
    },
  })
}

export function useCreateIdentityIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateIdentityIntegrationInput) => {
      const res = await api.post<{ data: IdentityIntegrationCreated }>('/identity/integrations', input)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['identity', 'integrations'] })
      qc.invalidateQueries({ queryKey: ['identity', 'clients'] })
    },
  })
}

export function useUpdateIdentityIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateIdentityIntegrationInput }) => {
      const res = await api.patch<{ data: IdentityIntegrationListItem }>(`/identity/integrations/${id}`, input)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['identity', 'integrations'] })
      qc.invalidateQueries({ queryKey: ['identity', 'clients'] })
    },
  })
}

export function useRotateIntegrationSecret() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ data: IdentityIntegrationRotatedSecret }>(`/identity/integrations/${id}/rotate-secret`)
      return res.data
    },
  })
}

export function useRevokeIdentityIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/identity/integrations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['identity', 'integrations'] })
      qc.invalidateQueries({ queryKey: ['identity', 'clients'] })
    },
  })
}
