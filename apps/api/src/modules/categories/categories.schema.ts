import { z } from 'zod'

const categoryTypeEnum = z.enum(['INCOME', 'EXPENSE', 'BOTH'])

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: categoryTypeEnum,
  parentId: z.string().uuid().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
})

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  type: categoryTypeEnum.optional(),
  parentId: z.union([z.string().uuid(), z.null()]).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
