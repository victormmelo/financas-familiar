import { randomBytes } from 'crypto'
import { prisma } from '../../lib/prisma.js'
import type { CreateMcpTokenInput } from './mcp-tokens.schema.js'

/** Mascara o segredo; mantém prefixo e últimos caracteres para identificação. */
export function maskMcpToken(token: string): string {
  if (!token.startsWith('mcp_') || token.length < 16) {
    return 'mcp_••••••••'
  }
  const suffix = token.slice(-8)
  return `mcp_${'•'.repeat(12)}…${suffix}`
}

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
  const rows = await prisma.mcpToken.findMany({
    where: { userId, revokedAt: null },
    select: {
      id: true,
      label: true,
      token: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    tokenPreview: maskMcpToken(row.token),
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  }))
}

/** Retorna o token completo para o dono (ex.: copiar no cliente). Nunca logar. */
export async function getMcpTokenPlain(userId: string, tokenId: string): Promise<{ token: string }> {
  const record = await prisma.mcpToken.findFirst({
    where: { id: tokenId, userId, revokedAt: null },
    select: { token: true },
  })
  if (!record) throw Object.assign(new Error('Token não encontrado'), { statusCode: 404 })

  return { token: record.token }
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
