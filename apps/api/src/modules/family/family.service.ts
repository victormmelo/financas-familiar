import { prisma } from '../../lib/prisma.js'
import type { UpdateFamilyInput } from './family.schema.js'

export async function getFamily(familyId: string) {
  return prisma.family.findUniqueOrThrow({
    where: { id: familyId },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      },
    },
  })
}

export async function updateFamily(familyId: string, input: UpdateFamilyInput) {
  return prisma.family.update({
    where: { id: familyId },
    data: { name: input.name },
  })
}

export async function removeMember(familyId: string, userId: string, requesterId: string) {
  if (userId === requesterId) {
    throw Object.assign(new Error('Não é possível remover a si mesmo'), { statusCode: 400 })
  }

  const user = await prisma.user.findFirst({ where: { id: userId, familyId } })
  if (!user) throw Object.assign(new Error('Membro não encontrado'), { statusCode: 404 })

  // Soft delete: reassign their transactions to stay, just remove user record
  // For now we just delete (the user can be deleted as there are no constraints blocking this)
  await prisma.user.delete({ where: { id: userId } })
}
