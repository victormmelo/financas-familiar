import { randomBytes } from 'crypto'
import { prisma } from '../../lib/prisma.js'
import type { CreateMcpTokenInput } from './mcp-tokens.schema.js'

export async function createMcpToken(userId: string, familyId: string, input: CreateMcpTokenInput) {
  const token = `mcp_${randomBytes(32).toString('hex')}`

  return prisma.mcpToken.create({
    data: {
      userId,
      familyId,
      token,
      label: input.label,
    },
    select: {
      id: true,
      label: true,
      token: true,
      createdAt: true,
    },
  })
}

export async function listMcpTokens(userId: string) {
  return prisma.mcpToken.findMany({
    where: { userId, revokedAt: null },
    select: {
      id: true,
      label: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function revokeMcpToken(userId: string, tokenId: string) {
  const record = await prisma.mcpToken.findFirst({
    where: { id: tokenId, userId, revokedAt: null },
  })
  if (!record) throw Object.assign(new Error('Token não encontrado'), { statusCode: 404 })

  await prisma.mcpToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  })
}

export async function validateMcpToken(token: string) {
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

  await prisma.mcpToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  })

  return {
    tokenId: record.id,
    userId: record.userId,
    familyId: record.familyId,
    role: record.user.role,
  }
}
