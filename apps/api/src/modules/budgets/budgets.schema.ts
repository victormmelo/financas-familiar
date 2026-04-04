import { z } from 'zod'

export const createBudgetSchema = z.object({
  categoryId: z.string().uuid('ID de categoria inválido'),
  referenceMonth: z.number().int().min(1).max(12, 'Mês inválido (1-12)'),
  referenceYear: z.number().int().min(2000).max(2100, 'Ano inválido'),
  limitAmount: z.number().positive('Limite deve ser positivo'),
})

export const updateBudgetSchema = z.object({
  limitAmount: z.number().positive('Limite deve ser positivo'),
})

export const listBudgetsSchema = z.object({
  referenceMonth: z.coerce.number().int().min(1).max(12).optional(),
  referenceYear: z.coerce.number().int().min(2000).max(2100).optional(),
})

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>
export type ListBudgetsInput = z.infer<typeof listBudgetsSchema>
