import { z } from 'zod'

export const updateFamilySchema = z.object({
  name: z.string().min(2, 'Nome da família muito curto'),
})

export type UpdateFamilyInput = z.infer<typeof updateFamilySchema>
