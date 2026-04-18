import { z } from 'zod'

const transactionTypeEnum = z.enum(['INCOME', 'EXPENSE'])
const transactionNatureEnum = z.enum(['NORMAL', 'REIMBURSEMENT', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL'])
const draftSourceEnum = z.enum(['MANUAL', 'AI_TEXT', 'AI_VOICE', 'AI_RECEIPT', 'PDF', 'OFX', 'CSV', 'OPEN_FINANCE'])

export const createTransactionSchema = z
  .object({
    /** Opcional quando `creditCardId` está presente e o cartão tem conta padrão. */
    accountId: z.string().uuid('ID de conta inválido').optional(),
    categoryId: z.string().uuid().optional(),
    type: transactionTypeEnum,
    nature: transactionNatureEnum.default('NORMAL'),
    linkedTransactionId: z.string().uuid().optional(),
    reimbursementOverflowReason: z.string().min(5).max(500).optional(),
    amount: z.number().positive('Valor deve ser positivo'),
    description: z.string().min(1, 'Descrição obrigatória'),
    notes: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
    source: draftSourceEnum.default('MANUAL'),
    creditCardId: z.string().uuid().optional(),
    isRecurring: z.boolean().default(false),
    rrule: z.string().optional(),
    // parcelamento — mutuamente exclusivo com isRecurring
    installmentCount: z.number().int().min(2).max(360).optional(),
    liquidated: z.boolean().optional(),
    /** Se true, cria já como CONFIRMED (ex.: formulário web). Padrão false (rascunho). */
    confirmed: z.boolean().optional().default(false),
  })
  .refine(
    (data) => !(data.isRecurring && data.installmentCount),
    { message: 'Uma transação não pode ser recorrente e parcelada ao mesmo tempo', path: ['installmentCount'] },
  )
  .refine((data) => !data.isRecurring || !!data.rrule, {
    message: 'Transações recorrentes requerem o campo rrule',
    path: ['rrule'],
  })
  .refine((data) => data.creditCardId != null || data.accountId != null, {
    message: 'Selecione uma conta',
    path: ['accountId'],
  })
  .refine((data) => data.nature !== 'REIMBURSEMENT' || !!data.linkedTransactionId, {
    message: 'Transações de reembolso exigem linkedTransactionId',
    path: ['linkedTransactionId'],
  })
  .refine((data) => data.nature === 'REIMBURSEMENT' || !data.linkedTransactionId, {
    message: 'linkedTransactionId só pode ser usado com nature=REIMBURSEMENT',
    path: ['linkedTransactionId'],
  })
  .refine((data) => data.nature !== 'REIMBURSEMENT' || (!data.isRecurring && !data.installmentCount), {
    message: 'Reembolso não pode ser recorrente ou parcelado',
    path: ['nature'],
  })

export const updateTransactionSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  nature: transactionNatureEnum.optional(),
  linkedTransactionId: z.string().uuid().optional().nullable(),
  reimbursementOverflowReason: z.string().min(5).max(500).optional(),
  amount: z.number().positive().optional(),
  description: z.string().min(1).optional(),
  notes: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  liquidated: z.boolean().optional(),
  /** Troca de conta no lançamento (ex.: reembolso). Deve pertencer à mesma família. */
  accountId: z.string().uuid('ID de conta inválido').optional(),
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
  nature: transactionNatureEnum.optional(),
  linkedTransactionId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'DELETED']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isRecurring: z.coerce.boolean().optional(),
  liquidated: z.coerce.boolean().optional(),
})

export const dashboardSummarySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  liquidated: z.coerce.boolean().optional(),
})

export const expenseCategorySummarySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>
export type BulkConfirmInput = z.infer<typeof bulkConfirmSchema>
export type BulkSetCategoryInput = z.infer<typeof bulkSetCategorySchema>
export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>
export type DashboardSummaryInput = z.infer<typeof dashboardSummarySchema>
export type ExpenseCategorySummaryInput = z.infer<typeof expenseCategorySummarySchema>
