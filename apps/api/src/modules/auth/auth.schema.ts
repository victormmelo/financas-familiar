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

export const patchEntryPreferencesSchema = z.object({
  accountId: z.string().uuid('ID de conta inválido').nullable().optional(),
  creditCardId: z.string().uuid('ID de cartão inválido').nullable().optional(),
  expenseSettlement: z.enum(['ACCOUNT', 'CARD']).nullable().optional(),
})

export type BootstrapInput = z.infer<typeof bootstrapSchema>
export type InviteInput = z.infer<typeof inviteSchema>
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>
export type PatchEntryPreferencesInput = z.infer<typeof patchEntryPreferencesSchema>
