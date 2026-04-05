import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'

export const familyToolDefinitions = [
  {
    name: 'list_family_members',
    description: 'Lista os membros da família com seus papéis (ADMIN/MEMBER).',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
]

export function registerFamilyHandlers(
  context: McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  const { familyId } = context

  toolHandlerMap.set('list_family_members', async (_args) => {
    const family = await prisma.family.findFirst({
      where: { id: familyId },
      select: {
        id: true,
        name: true,
        members: {
          select: { id: true, name: true, email: true, role: true, createdAt: true },
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!family) throw new Error('Família não encontrada')

    return {
      family: { id: family.id, name: family.name },
      members: family.members,
    }
  })
}
