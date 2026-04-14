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

export const clientCredentialsSchema = z.object({
  clientId: z.string().trim().min(1, 'Client ID obrigatório').max(256),
  clientSecret: z.string().min(1, 'Client secret obrigatório').max(2048),
})

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>
export type ClientCredentialsInput = z.infer<typeof clientCredentialsSchema>
