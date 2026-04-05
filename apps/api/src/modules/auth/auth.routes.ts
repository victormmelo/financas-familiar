import type { FastifyPluginAsync } from 'fastify'
import {
  registerSchema,
  loginSchema,
  inviteSchema,
  acceptInviteSchema,
} from './auth.schema.js'
import * as authService from './auth.service.js'
import type { TokenPayload } from './auth.types.js'

const REFRESH_COOKIE = 'refreshToken'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/register
  fastify.post('/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = registerSchema.parse(request.body)
    const { user, tokens } = await authService.register(fastify, input)

    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    })

    return reply.status(201).send({ user, accessToken: tokens.accessToken })
  })

  // POST /auth/login
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body)
    const { user, tokens } = await authService.login(fastify, input)

    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    })

    return reply.send({ user, accessToken: tokens.accessToken })
  })

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE]
    if (!refreshToken) {
      return reply.status(401).send({ statusCode: 401, message: 'Refresh token não encontrado' })
    }

    const tokens = await authService.refresh(fastify, refreshToken)

    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    })

    return reply.send({ accessToken: tokens.accessToken })
  })

  // POST /auth/logout
  fastify.post('/logout', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE]
    if (refreshToken) {
      try {
        const payload = fastify.jwt.verify<TokenPayload & { jti?: string }>(refreshToken)
        await authService.logout(payload.sub, payload.jti)
      } catch {
        // Ignore invalid token on logout
      }
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/auth/refresh' })
    return reply.send({ message: 'Logout realizado com sucesso' })
  })

  // POST /auth/invite — ADMIN only
  fastify.post('/invite', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user as TokenPayload
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ statusCode: 403, message: 'Apenas ADMINs podem convidar membros' })
    }

    const input = inviteSchema.parse(request.body)
    const result = await authService.invite(fastify, user.familyId, user.sub, input)
    return reply.status(201).send(result)
  })

  // POST /auth/accept-invite/:token
  fastify.post<{ Params: { token: string } }>('/accept-invite/:token', async (request, reply) => {
    const { token } = request.params
    const input = acceptInviteSchema.parse(request.body)
    const { user, tokens } = await authService.acceptInvite(fastify, token, input)

    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    })

    return reply.status(201).send({ user, accessToken: tokens.accessToken })
  })
}

export default authRoutes
