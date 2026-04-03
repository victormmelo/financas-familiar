import { z } from 'zod'

const accountTypeEnum = z.enum(['CHECKING', 'SAVINGS', 'JOINT', 'INVESTMENT', 'CASH'])

export const createAccountSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: accountTypeEnum,
  initialBalance: z.number().default(0),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: accountTypeEnum.optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  isActive: z.boolean().optional(),
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
