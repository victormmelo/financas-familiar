import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface FamilyMember {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  createdAt: string
}

export interface Family {
  id: string
  name: string
  members: FamilyMember[]
}

export function useFamily() {
  return useQuery({
    queryKey: ['family'],
    queryFn: () => api.get<Family>('/family'),
  })
}

export function useFamilyMembers() {
  return useQuery({
    queryKey: ['family', 'members'],
    queryFn: () => api.get<FamilyMember[]>('/family/members'),
  })
}

export function useInviteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => api.post('/auth/invite', { email }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family'] }),
  })
}
