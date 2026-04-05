import { prisma } from './prisma.js'
import type { McpContext } from './context.js'

export async function validateMcpToken(authHeader: string | undefined): Promise<McpContext | null> {
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token.startsWith('mcp_')) return null

  const record = await prisma.mcpToken.findFirst({
    where: { token, revokedAt: null },
    select: {
      id: true,
      userId: true,
      familyId: true,
      user: { select: { role: true } },
    },
  })

  if (!record) return null

  // Atualiza lastUsedAt de forma não-bloqueante
  prisma.mcpToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return {
    userId: record.userId,
    familyId: record.familyId,
    role: record.user.role as 'ADMIN' | 'MEMBER',
  }
}
