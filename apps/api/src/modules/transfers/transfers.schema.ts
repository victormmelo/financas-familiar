import { z } from 'zod'

export const createTransferSchema = z.object({
  fromAccountId: z.string().uuid('ID de conta inválido'),
  toAccountId: z.string().uuid('ID de conta inválido'),
  amount: z.number().positive('Valor deve ser positivo'),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
}).refine((data) => data.fromAccountId !== data.toAccountId, {
  message: 'Conta de origem e destino devem ser diferentes',
  path: ['toAccountId'],
})

export const listTransfersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  fromAccountId: z.string().uuid().optional(),
  toAccountId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export type CreateTransferInput = z.infer<typeof createTransferSchema>
export type ListTransfersInput = z.infer<typeof listTransfersSchema>
