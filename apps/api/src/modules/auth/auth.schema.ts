import { z } from 'zod'

export const bootstrapSchema = z.object({
  familyName: z.string().min(2, 'Nome da família muito curto'),
  name: z.string().min(2, 'Nome muito curto').optional(),
})

export const inviteSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

export const acceptInviteSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
})

export type BootstrapInput = z.infer<typeof bootstrapSchema>
export type InviteInput = z.infer<typeof inviteSchema>
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>
