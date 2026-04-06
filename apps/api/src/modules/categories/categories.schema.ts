import { z } from 'zod'

const categoryTypeEnum = z.enum(['INCOME', 'EXPENSE', 'BOTH'])

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: categoryTypeEnum,
  isFixed: z.boolean().default(false),
  parentId: z.string().uuid().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
})

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  type: categoryTypeEnum.optional(),
  isFixed: z.boolean().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
