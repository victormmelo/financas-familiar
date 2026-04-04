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

export type CreateTransferInput = z.infer<typeof createTransferSchema>
