import { serializeDbDateOrNull } from '@financas/shared-types'
import { prisma } from '../prisma.js'
import type { McpContext } from '../context.js'
import { withMcpToolOAuth } from '../mcp-scopes.js'

const goalToolDefinitionsBase = [
  {
    name: 'list_goals',
    description: 'Lista as metas financeiras da família com progresso atual.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeCompleted: {
          type: 'boolean',
          description: 'Incluir metas já concluídas (padrão: false)',
        },
      },
    },
  },
]

export const goalToolDefinitions = goalToolDefinitionsBase.map((t) => withMcpToolOAuth(t))

export function registerGoalHandlers(
  getContext: () => McpContext,
  toolHandlerMap: Map<string, (args: unknown) => Promise<unknown>>,
) {
  toolHandlerMap.set('list_goals', async (args) => {
    const { familyId } = getContext()
    const includeCompleted = (args as { includeCompleted?: boolean })?.includeCompleted ?? false

    const goals = await prisma.goal.findMany({
      where: { familyId, ...(includeCompleted ? {} : { isCompleted: false }) },
      include: {
        account: { select: { id: true, name: true } },
      },
      orderBy: { deadline: 'asc' },
    })

    return {
      goals: goals.map((g: (typeof goals)[number]) => {
        const target = Number(g.targetAmount)
        const current = Number(g.currentAmount)
        const progressPercent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
        const remaining = Math.max(0, target - current)

        return {
          id: g.id,
          name: g.name,
          targetAmount: target,
          currentAmount: current,
          remaining,
          progressPercent,
          deadline: serializeDbDateOrNull(g.deadline),
          isCompleted: g.isCompleted,
          account: g.account,
          icon: g.icon,
          color: g.color,
        }
      }),
    }
  })
}
