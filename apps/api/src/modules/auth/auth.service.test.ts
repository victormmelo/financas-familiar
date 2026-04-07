import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

/** Cliente passado ao callback de `prisma.$transaction` (transação interativa). */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>

// Mock dependencies before importing the module under test
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    family: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    familyInvite: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('../../lib/redis.js', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('../../jobs/email.queue.js', () => ({
  emailQueue: { add: vi.fn() },
}))

import { prisma } from '../../lib/prisma.js'
import { redis } from '../../lib/redis.js'
import { register, login, refresh, logout } from './auth.service.js'

const mockApp = {
  jwt: {
    sign: vi.fn().mockReturnValue('mock-token'),
    verify: vi.fn(),
  },
}

const mockUser = {
  id: 'user-1',
  familyId: 'family-1',
  name: 'João Silva',
  email: 'joao@exemplo.com',
  passwordHash: '',
  role: 'ADMIN',
  family: { id: 'family-1', name: 'Família Silva' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('register', () => {
  it('deve criar família e usuário com role ADMIN', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.$transaction).mockImplementation(
      async (fn: (tx: PrismaTransactionClient) => Promise<unknown>) => {
        const txMock = {
          family: { create: vi.fn().mockResolvedValue({ id: 'family-1', name: 'Família Silva' }) },
          user: {
            create: vi.fn().mockResolvedValue({ ...mockUser, passwordHash: 'hashed' }),
          },
        }
        return fn(txMock as unknown as PrismaTransactionClient)
      },
    )

    const result = await register(mockApp as never, {
      name: 'João Silva',
      email: 'joao@exemplo.com',
      password: 'senha123',
      familyName: 'Família Silva',
    })

    expect(result.user.email).toBe('joao@exemplo.com')
    expect(result.user.role).toBe('ADMIN')
    expect(result.tokens.accessToken).toBe('mock-token')
    expect(redis.set).toHaveBeenCalledOnce()
  })

  it('deve rejeitar e-mail duplicado com status 409', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)

    await expect(
      register(mockApp as never, {
        name: 'João',
        email: 'joao@exemplo.com',
        password: 'senha123',
        familyName: 'Família',
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: 'E-mail já cadastrado' })
  })
})

describe('login', () => {
  it('deve autenticar usuário com credenciais válidas', async () => {
    const hash = await bcrypt.hash('senha123', 10)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, passwordHash: hash } as never)

    const result = await login(mockApp as never, { email: 'joao@exemplo.com', password: 'senha123' })

    expect(result.user.email).toBe('joao@exemplo.com')
    expect(result.tokens.accessToken).toBe('mock-token')
  })

  it('deve rejeitar senha incorreta com status 401', async () => {
    const hash = await bcrypt.hash('outra-senha', 10)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, passwordHash: hash } as never)

    await expect(
      login(mockApp as never, { email: 'joao@exemplo.com', password: 'senha-errada' }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('deve rejeitar e-mail inexistente com status 401', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    await expect(
      login(mockApp as never, { email: 'nao@existe.com', password: 'qualquer' }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('refresh', () => {
  it('deve emitir novos tokens quando refresh token é válido', async () => {
    const payload = { sub: 'user-1', familyId: 'family-1', role: 'ADMIN', jti: 'token-id' }
    vi.mocked(mockApp.jwt.verify).mockReturnValue(payload)
    vi.mocked(redis.get).mockResolvedValue('1')
    vi.mocked(redis.del).mockResolvedValue(1)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)

    const tokens = await refresh(mockApp as never, 'valid-refresh-token')

    expect(tokens.accessToken).toBe('mock-token')
    expect(redis.del).toHaveBeenCalledOnce()
    expect(redis.set).toHaveBeenCalledOnce()
  })

  it('deve rejeitar refresh token já utilizado (rotation)', async () => {
    const payload = { sub: 'user-1', familyId: 'family-1', role: 'ADMIN', jti: 'token-id' }
    vi.mocked(mockApp.jwt.verify).mockReturnValue(payload)
    vi.mocked(redis.get).mockResolvedValue(null) // token não existe no Redis

    await expect(refresh(mockApp as never, 'used-refresh-token')).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('logout', () => {
  it('deve deletar chave do Redis quando jti é fornecido', async () => {
    vi.mocked(redis.del).mockResolvedValue(1)

    await logout('user-1', 'token-id')

    expect(redis.del).toHaveBeenCalledWith('refresh:user-1:token-id')
  })

  it('não deve chamar redis.del quando jti é undefined', async () => {
    await logout('user-1', undefined)
    expect(redis.del).not.toHaveBeenCalled()
  })
})
