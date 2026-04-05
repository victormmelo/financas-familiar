import { z } from 'zod'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const createStatementItemSchema = z.object({
  accountId: z.string().uuid('ID de conta inválido'),
  sessionId: z.string().uuid().optional(),
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.number().positive('Valor deve ser positivo'),
  description: z.string().min(1, 'Descrição obrigatória'),
  date: z.string().regex(dateRegex, 'Data inválida (use YYYY-MM-DD)'),
})

export const listStatementItemsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  accountId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'MATCHED', 'REJECTED', 'IGNORED', 'CONVERTED']).optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
})

export const runMatchingSchema = z.object({
  accountId: z.string().uuid('ID de conta inválido'),
  startDate: z.string().regex(dateRegex, 'Data inválida'),
  endDate: z.string().regex(dateRegex, 'Data inválida'),
})

export const acceptMatchSchema = z.object({
  transactionId: z.string().uuid('ID de transação inválido'),
})

export const convertItemSchema = z.object({
  categoryId: z.string().uuid().optional(),
  description: z.string().min(1).optional(),
  notes: z.string().optional(),
})

export const getBalanceSchema = z.object({
  reportedBalance: z.coerce.number(),
})

export type CreateStatementItemInput = z.infer<typeof createStatementItemSchema>
export type ListStatementItemsInput = z.infer<typeof listStatementItemsSchema>
export type RunMatchingInput = z.infer<typeof runMatchingSchema>
export type AcceptMatchInput = z.infer<typeof acceptMatchSchema>
export type ConvertItemInput = z.infer<typeof convertItemSchema>
export type GetBalanceInput = z.infer<typeof getBalanceSchema>
