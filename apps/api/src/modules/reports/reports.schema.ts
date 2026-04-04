import { z } from 'zod'

export const createReportSchema = z.object({
  type: z.enum(['DRE', 'CASH_FLOW', 'PATRIMONY']),
  params: z
    .object({
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)')
        .optional(),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)')
        .optional(),
      referenceMonth: z.number().int().min(1).max(12).optional(),
      referenceYear: z.number().int().min(2000).max(2100).optional(),
    })
    .default({}),
})

export const listReportsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['DRE', 'CASH_FLOW', 'PATRIMONY']).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'DONE', 'FAILED']).optional(),
})

export type CreateReportInput = z.infer<typeof createReportSchema>
export type ListReportsInput = z.infer<typeof listReportsSchema>
