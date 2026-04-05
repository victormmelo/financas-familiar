import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'

export const categoryToolDefinitions = [
  {
    name: 'list_categories',
    description:
      'Lista todas as categorias da família de forma hierárquica. Essencial para classificar transações corretamente.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['INCOME', 'EXPENSE', 'BOTH'],
          description: 'Filtrar por tipo de categoria',
        },
      },
    },
  },
]

export function registerCategoryHandlers(
  context: McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  const { familyId } = context

  toolHandlerMap.set('list_categories', async (args) => {
    const { type } = z
      .object({ type: z.enum(['INCOME', 'EXPENSE', 'BOTH']).optional() })
      .parse(args ?? {})

    const categories = await prisma.category.findMany({
      where: {
        familyId,
        parentId: null, // apenas raízes
        ...(type && { type }),
      },
      include: {
        subcategories: {
          select: { id: true, name: true, type: true, icon: true, color: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    return { categories }
  })
}
