import { z } from 'zod'

export const createCreditCardSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  limit: z.number().positive('Limite deve ser positivo'),
  closingDay: z.number().int().min(1).max(31, 'Dia de fechamento inválido (1-31)'),
  dueDay: z.number().int().min(1).max(31, 'Dia de vencimento inválido (1-31)'),
  /** Conta âncora para lançamentos na fatura deste cartão. */
  defaultAccountId: z.string().uuid('ID de conta inválido'),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export const updateCreditCardSchema = z.object({
  name: z.string().min(1).optional(),
  limit: z.number().positive().optional(),
  closingDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  defaultAccountId: z.string().uuid().optional().nullable(),
  color: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export const listInvoicesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
  status: z.enum(['OPEN', 'CLOSED', 'PAID']).optional(),
})

export const payInvoiceSchema = z.object({
  accountId: z.string().uuid('ID de conta inválido'),
  amount: z.number().positive('Valor deve ser positivo').optional(),
})

export type CreateCreditCardInput = z.infer<typeof createCreditCardSchema>
export type UpdateCreditCardInput = z.infer<typeof updateCreditCardSchema>
export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>
