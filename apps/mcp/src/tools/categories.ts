import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'
import { withMcpToolOAuth } from '../mcp-scopes.js'

const categoryToolDefinitionsBase = [
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
  {
    name: 'create_category',
    description:
      'Cria uma categoria (receita, despesa ou ambos). Apenas ADMIN. Use para novas classificações como moradia, saúde, etc.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Nome da categoria' },
        type: {
          type: 'string',
          enum: ['INCOME', 'EXPENSE', 'BOTH'],
          description: 'INCOME, EXPENSE ou BOTH (padrão: EXPENSE)',
        },
        parentId: { type: 'string', description: 'UUID da categoria pai (subcategoria)' },
        icon: { type: 'string', description: 'Ícone (opcional)' },
        color: { type: 'string', description: 'Cor hex (opcional)' },
      },
      required: ['name'],
    },
  },
]

export const categoryToolDefinitions = categoryToolDefinitionsBase.map((t) => withMcpToolOAuth(t))

export function registerCategoryHandlers(
  getContext: () => McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  toolHandlerMap.set('list_categories', async (args) => {
    const { familyId } = getContext()
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

  toolHandlerMap.set('create_category', async (args) => {
    const { familyId, role } = getContext()
    if (role !== 'ADMIN') {
      throw new Error('Apenas ADMINs podem criar categorias')
    }

    const parsed = z
      .object({
        name: z.string().min(1, 'Nome obrigatório'),
        type: z.enum(['INCOME', 'EXPENSE', 'BOTH']).default('EXPENSE'),
        parentId: z.string().uuid().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
      })
      .parse(args ?? {})

    if (parsed.parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parsed.parentId, familyId },
      })
      if (!parent) {
        throw new Error('Categoria pai não encontrada')
      }
    }

    const category = await prisma.category.create({
      data: {
        familyId,
        name: parsed.name,
        type: parsed.type,
        parentId: parsed.parentId,
        icon: parsed.icon,
        color: parsed.color,
      },
    })

    return { category }
  })
}
