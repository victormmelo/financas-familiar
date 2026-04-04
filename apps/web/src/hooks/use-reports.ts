import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Report {
  id: string
  type: 'DRE' | 'CASH_FLOW' | 'PATRIMONY'
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
  fileUrl?: string
  params?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export function useReports(params?: { page?: number; limit?: number; type?: string; status?: string }) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString() : ''
  return useQuery({
    queryKey: ['reports', params],
    queryFn: () => api.get<{ data: Report[]; total: number }>(`/reports${qs ? `?${qs}` : ''}`),
  })
}

export function useCreateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { type: string; params?: { startDate?: string; endDate?: string; referenceMonth?: number; referenceYear?: number } }) =>
      api.post<Report>('/reports', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  })
}
