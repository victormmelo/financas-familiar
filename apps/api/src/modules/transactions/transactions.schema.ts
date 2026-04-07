import { z } from 'zod'

const transactionTypeEnum = z.enum(['INCOME', 'EXPENSE'])
const draftSourceEnum = z.enum(['MANUAL', 'AI_TEXT', 'AI_VOICE', 'AI_RECEIPT', 'PDF', 'OFX', 'CSV', 'OPEN_FINANCE'])

export const createTransactionSchema = z.object({
  accountId: z.string().uuid('ID de conta inválido'),
  categoryId: z.string().uuid().optional(),
  type: transactionTypeEnum,
  amount: z.number().positive('Valor deve ser positivo'),
  description: z.string().min(1, 'Descrição obrigatória'),
  notes: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
  source: draftSourceEnum.default('MANUAL'),
  isRecurring: z.boolean().default(false),
  rrule: z.string().optional(),
})

export const updateTransactionSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  amount: z.number().positive().optional(),
  description: z.string().min(1).optional(),
  notes: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const bulkConfirmSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Forneça ao menos um ID'),
})

/** `null` ou campo omitido remove a categoria das transações selecionadas. */
export const bulkSetCategorySchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Forneça ao menos um ID'),
  categoryId: z.union([z.string().uuid(), z.null()]).optional(),
})

export const listTransactionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  type: transactionTypeEnum.optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'DELETED']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>
export type BulkConfirmInput = z.infer<typeof bulkConfirmSchema>
export type BulkSetCategoryInput = z.infer<typeof bulkSetCategorySchema>
export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>
