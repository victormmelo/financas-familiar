import { z } from 'zod'

export const createMcpTokenSchema = z.object({
  label: z.string().min(1).max(100),
})

export const revokeMcpTokenSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
})

export type CreateMcpTokenInput = z.infer<typeof createMcpTokenSchema>
