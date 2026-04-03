import { z } from 'zod'

export const registerSchema = z.object({
  familyName: z.string().min(2, 'Nome da família muito curto'),
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

export const inviteSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

export const acceptInviteSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type InviteInput = z.infer<typeof inviteSchema>
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>
