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

/** Query opcional para saldo até o fim do mês (dashboard histórico). */
export const listAccountsQuerySchema = z
  .object({
    asOfYear: z.coerce.number().int().min(2000).max(2100).optional(),
    asOfMonth: z.coerce.number().int().min(1).max(12).optional(),
  })
  .refine(
    (q) =>
      (q.asOfYear === undefined && q.asOfMonth === undefined) ||
      (q.asOfYear !== undefined && q.asOfMonth !== undefined),
    { message: 'asOfYear e asOfMonth devem ser enviados juntos' },
  )

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
export type ListAccountsQueryInput = z.infer<typeof listAccountsQuerySchema>
