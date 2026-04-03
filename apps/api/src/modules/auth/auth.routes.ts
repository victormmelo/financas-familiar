import type { FastifyPluginAsync } from 'fastify'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/register
  // Registers a new user (first user becomes ADMIN of a new family)

  // POST /auth/login
  // Authenticates user and returns access + refresh tokens

  // POST /auth/refresh
  // Refreshes access token using a valid refresh token

  // POST /auth/invite
  // ADMIN only — sends an invitation link to a new family member

  // POST /auth/accept-invite/:token
  // Accepts a family invitation and creates the user account
}

export default authRoutes
