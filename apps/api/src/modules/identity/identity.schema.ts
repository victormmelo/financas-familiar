import { z } from 'zod'

export const createIntegrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(280).optional(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
})

export const updateIntegrationSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
})

export const integrationParamsSchema = z.object({
  id: z.string().uuid(),
})

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>
