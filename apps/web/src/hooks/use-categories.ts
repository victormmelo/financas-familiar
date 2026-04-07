import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Category {
  id: string
  name: string
  type: 'INCOME' | 'EXPENSE' | 'BOTH'
  parentId?: string
  icon?: string
  color?: string
  isActive: boolean
  children?: Category[]
}

/** Shape returned by Prisma JSON (relation name `subcategories`) */
interface CategoryApiNode {
  id: string
  name: string
  type: 'INCOME' | 'EXPENSE' | 'BOTH'
  parentId?: string | null
  icon?: string | null
  color?: string | null
  isActive: boolean
  subcategories?: CategoryApiNode[]
}

function normalizeCategory(cat: CategoryApiNode): Category {
  return {
    id: cat.id,
    name: cat.name,
    type: cat.type,
    parentId: cat.parentId ?? undefined,
    icon: cat.icon ?? undefined,
    color: cat.color ?? undefined,
    isActive: cat.isActive,
    children: cat.subcategories?.map(normalizeCategory) ?? [],
  }
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const raw = await api.get<CategoryApiNode[]>('/categories')
      return raw.map(normalizeCategory)
    },
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; type: string; parentId?: string; icon?: string; color?: string }) =>
      api.post<Category>('/categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; type?: string; icon?: string; color?: string; isActive?: boolean }) =>
      api.patch<Category>(`/categories/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}
