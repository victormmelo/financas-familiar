import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import { redis } from '../../lib/redis.js'
import type { FastifyInstance } from 'fastify'
import type {
  RegisterInput,
  LoginInput,
  InviteInput,
  AcceptInviteInput,
} from './auth.schema.js'
import type { AuthTokens, AuthUser, TokenPayload } from './auth.types.js'

const SALT_ROUNDS = 12
const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '7d'
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
const INVITE_EXPIRY_HOURS = 48

function refreshKey(userId: string, tokenId: string) {
  return `refresh:${userId}:${tokenId}`
}

async function generateTokens(app: FastifyInstance, payload: TokenPayload): Promise<AuthTokens> {
  const tokenId = crypto.randomBytes(16).toString('hex')
  const accessToken = app.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL })
  const refreshToken = app.jwt.sign(
    { ...payload, jti: tokenId },
    { expiresIn: REFRESH_TOKEN_TTL },
  )

  // Store refresh token ID in Redis for rotation validation
  await redis.set(refreshKey(payload.sub, tokenId), '1', 'EX', REFRESH_TOKEN_TTL_SECONDS)

  return { accessToken, refreshToken }
}

function buildAuthUser(user: { id: string; name: string; email: string; role: string; familyId: string; family: { id: string; name: string } }): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    familyId: user.familyId,
    family: { id: user.family.id, name: user.family.name },
  }
}

export async function register(app: FastifyInstance, input: RegisterInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw Object.assign(new Error('E-mail já cadastrado'), { statusCode: 409 })
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)

  const result = await prisma.$transaction(async (tx) => {
    const family = await tx.family.create({ data: { name: input.familyName } })
    const user = await tx.user.create({
      data: {
        familyId: family.id,
        name: input.name,
        email: input.email,
        passwordHash,
        role: 'ADMIN',
      },
      include: { family: true },
    })
    return user
  })

  const payload: TokenPayload = {
    sub: result.id,
    familyId: result.familyId,
    role: result.role,
  }
  const tokens = await generateTokens(app, payload)

  return { user: buildAuthUser(result), tokens }
}

export async function login(app: FastifyInstance, input: LoginInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { family: true },
  })

  const unauthorized = () =>
    Object.assign(new Error('E-mail ou senha inválidos'), { statusCode: 401 })

  if (!user) throw unauthorized()

  const valid = await bcrypt.compare(input.password, user.passwordHash)
  if (!valid) throw unauthorized()

  const payload: TokenPayload = {
    sub: user.id,
    familyId: user.familyId,
    role: user.role,
  }
  const tokens = await generateTokens(app, payload)

  return { user: buildAuthUser(user), tokens }
}

export async function refresh(app: FastifyInstance, refreshToken: string): Promise<AuthTokens> {
  let payload: TokenPayload & { jti?: string }
  try {
    payload = app.jwt.verify<TokenPayload & { jti?: string }>(refreshToken)
  } catch {
    throw Object.assign(new Error('Refresh token inválido ou expirado'), { statusCode: 401 })
  }

  const jti = payload.jti
  if (!jti) {
    throw Object.assign(new Error('Refresh token inválido'), { statusCode: 401 })
  }

  // Validate token exists in Redis (refresh rotation)
  const key = refreshKey(payload.sub, jti)
  const exists = await redis.get(key)
  if (!exists) {
    throw Object.assign(new Error('Refresh token já utilizado ou expirado'), { statusCode: 401 })
  }

  // Invalidate current refresh token
  await redis.del(key)

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { statusCode: 401 })

  const newPayload: TokenPayload = {
    sub: user.id,
    familyId: user.familyId,
    role: user.role,
  }
  return generateTokens(app, newPayload)
}

export async function logout(userId: string, jti?: string) {
  if (jti) {
    await redis.del(refreshKey(userId, jti))
  }
}

export async function invite(
  app: FastifyInstance,
  familyId: string,
  invitedById: string,
  input: InviteInput,
): Promise<{ token: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw Object.assign(new Error('Usuário já possui conta'), { statusCode: 409 })
  }

  const pendingInvite = await prisma.familyInvite.findFirst({
    where: {
      email: input.email,
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
    data: { familyId, invitedById, email: input.email, token, expiresAt },
  })

  // TODO: dispatch email via BullMQ
  app.log.info(`[Auth] Invite created for ${input.email}, token: ${token}`)

  return { token }
}

export async function acceptInvite(
  app: FastifyInstance,
  token: string,
  input: AcceptInviteInput,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const invite = await prisma.familyInvite.findUnique({ where: { token } })

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw Object.assign(new Error('Convite inválido ou expirado'), { statusCode: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email: invite.email } })
  if (existing) {
    throw Object.assign(new Error('E-mail já cadastrado'), { statusCode: 409 })
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        familyId: invite.familyId,
        name: input.name,
        email: invite.email,
        passwordHash,
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

  const payload: TokenPayload = {
    sub: result.id,
    familyId: result.familyId,
    role: result.role,
  }
  const tokens = await generateTokens(app, payload)

  return { user: buildAuthUser(result), tokens }
}
