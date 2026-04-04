import { z } from 'zod'

export const createGoalSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  targetAmount: z.number().positive('Valor alvo deve ser positivo'),
  currentAmount: z.number().min(0).default(0),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)')
    .optional(),
  accountId: z.string().uuid().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
})

export const updateGoalSchema = z.object({
  name: z.string().min(1).optional(),
  targetAmount: z.number().positive().optional(),
  currentAmount: z.number().min(0).optional(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  accountId: z.string().uuid().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
})

export type CreateGoalInput = z.infer<typeof createGoalSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>
