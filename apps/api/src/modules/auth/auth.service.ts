import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { emailQueue } from '../../jobs/email.queue.js'
import type { BootstrapInput, InviteInput, AcceptInviteInput } from './auth.schema.js'
import type { AuthUser } from './auth.types.js'
import type { KeycloakAccessClaims } from '../../lib/keycloak-claims.js'
import { resolveEmailFromClaims } from '../../lib/keycloak-claims.js'

const INVITE_EXPIRY_HOURS = 48

export function buildAuthUser(user: {
  id: string
  name: string
  email: string
  role: string
  familyId: string
  family: { id: string; name: string }
}): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    familyId: user.familyId,
    family: { id: user.family.id, name: user.family.name },
  }
}

function requireVerifiedEmail(claims: KeycloakAccessClaims): void {
  if (claims.email_verified === false) {
    throw Object.assign(new Error('E-mail ainda não verificado no provedor de identidade'), { statusCode: 403 })
  }
}

/**
 * Primeiro acesso: cria família + usuário ADMIN vinculado ao `sub` do Keycloak.
 * Só após e-mail verificado no token (quando informado pelo IdP).
 */
export async function bootstrap(
  input: BootstrapInput,
  claims: KeycloakAccessClaims,
): Promise<{ user: AuthUser }> {
  requireVerifiedEmail(claims)
  const email = resolveEmailFromClaims(claims)
  if (!email) {
    throw Object.assign(new Error('Token sem e-mail utilizável para cadastro'), { statusCode: 400 })
  }

  const existingSub = await prisma.user.findUnique({ where: { keycloakSub: claims.sub } })
  if (existingSub) {
    throw Object.assign(new Error('Usuário já vinculado a esta conta'), { statusCode: 409 })
  }

  const existingEmail = await prisma.user.findUnique({ where: { email } })
  if (existingEmail) {
    throw Object.assign(new Error('E-mail já cadastrado'), { statusCode: 409 })
  }

  const displayName =
    input.name?.trim() ||
    email.split('@')[0] ||
    'Usuário'

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const family = await tx.family.create({ data: { name: input.familyName } })
    const user = await tx.user.create({
      data: {
        familyId: family.id,
        name: displayName,
        email,
        keycloakSub: claims.sub,
        passwordHash: null,
        role: 'ADMIN',
      },
      include: { family: true },
    })
    return user
  })

  return { user: buildAuthUser(result) }
}

export async function invite(
  familyId: string,
  invitedById: string,
  input: InviteInput,
): Promise<{ token: string }> {
  const emailNorm = input.email.trim().toLowerCase()

  const existing = await prisma.user.findUnique({ where: { email: emailNorm } })
  if (existing) {
    throw Object.assign(new Error('Usuário já possui conta'), { statusCode: 409 })
  }

  const pendingInvite = await prisma.familyInvite.findFirst({
    where: {
      email: emailNorm,
      familyId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  })
  if (pendingInvite) {
    throw Object.assign(new Error('Já existe um convite pendente para este e-mail'), { statusCode: 409 })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000)

  await prisma.familyInvite.create({
    data: { familyId, invitedById, email: emailNorm, token, expiresAt },
  })

  const family = await prisma.family.findUniqueOrThrow({ where: { id: familyId } })
  const invitedBy = await prisma.user.findUniqueOrThrow({ where: { id: invitedById } })

  await emailQueue.add('send-invite', {
    to: emailNorm,
    inviteToken: token,
    familyName: family.name,
    invitedByName: invitedBy.name,
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  })

  return { token }
}

/**
 * Convite: requer Bearer Keycloak; e-mail do token deve coincidir com o do convite.
 */
export async function acceptInvite(
  inviteToken: string,
  input: AcceptInviteInput,
  claims: KeycloakAccessClaims,
): Promise<{ user: AuthUser }> {
  requireVerifiedEmail(claims)
  const email = resolveEmailFromClaims(claims)
  if (!email) {
    throw Object.assign(new Error('Token sem e-mail utilizável'), { statusCode: 400 })
  }

  const invite = await prisma.familyInvite.findUnique({ where: { token: inviteToken } })

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw Object.assign(new Error('Convite inválido ou expirado'), { statusCode: 400 })
  }

  if (email !== invite.email.trim().toLowerCase()) {
    throw Object.assign(
      new Error('O e-mail da sessão deve ser o mesmo do convite'),
      { statusCode: 403 },
    )
  }

  const existingSub = await prisma.user.findUnique({ where: { keycloakSub: claims.sub } })
  if (existingSub) {
    throw Object.assign(new Error('Esta conta já está vinculada a um usuário'), { statusCode: 409 })
  }

  const existingEmail = await prisma.user.findUnique({ where: { email: invite.email } })
  if (existingEmail) {
    throw Object.assign(new Error('E-mail já cadastrado'), { statusCode: 409 })
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const user = await tx.user.create({
      data: {
        familyId: invite.familyId,
        name: input.name,
        email: invite.email,
        keycloakSub: claims.sub,
        passwordHash: null,
        role: 'MEMBER',
      },
      include: { family: true },
    })
    await tx.familyInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    })
    return user
  })

  return { user: buildAuthUser(result) }
}

export async function findAuthUserByKeycloakSub(keycloakSub: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { keycloakSub },
    include: { family: true },
  })
  if (!user) return null
  return buildAuthUser(user)
}
