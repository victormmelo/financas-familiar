import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'

/** Cliente passado ao callback de `prisma.$transaction` (transação interativa). */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
    creditCard: {
      findFirst: vi.fn(),
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

vi.mock('../../jobs/email.queue.js', () => ({
  emailQueue: { add: vi.fn() },
}))

import { prisma } from '../../lib/prisma.js'
import { emailQueue } from '../../jobs/email.queue.js'
import {
  bootstrap,
  invite,
  acceptInvite,
  findAuthUserByKeycloakSub,
  updateUserEntryPreferences,
} from './auth.service.js'
import type { KeycloakAccessClaims } from '../../lib/keycloak-claims.js'

const kcClaims = (over: Partial<KeycloakAccessClaims> = {}): KeycloakAccessClaims =>
  ({
    sub: 'kc-sub-1',
    email: 'joao@exemplo.com',
    email_verified: true,
    ...over,
  }) as KeycloakAccessClaims

const mockUserRow = {
  id: 'user-1',
  familyId: 'family-1',
  name: 'João Silva',
  email: 'joao@exemplo.com',
  passwordHash: null as string | null,
  keycloakSub: 'kc-sub-1',
  role: 'ADMIN',
  family: { id: 'family-1', name: 'Família Silva' },
  entryExpenseSettlement: null as 'ACCOUNT' | 'CARD' | null,
  entryDefaultAccountId: null as string | null,
  entryDefaultCreditCardId: null as string | null,
  entryDefaultAccount: null as {
    id: string
    name: string
    isActive: boolean
    familyId: string
  } | null,
  entryDefaultCreditCard: null as {
    id: string
    name: string
    isActive: boolean
    familyId: string
  } | null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('bootstrap', () => {
  it('deve criar família e usuário ADMIN com keycloakSub', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.$transaction).mockImplementation(
      async (fn: (tx: PrismaTransactionClient) => Promise<unknown>) => {
        const txMock = {
          family: { create: vi.fn().mockResolvedValue({ id: 'family-1', name: 'Família Silva' }) },
          user: {
            create: vi.fn().mockResolvedValue(mockUserRow),
          },
        }
        return fn(txMock as unknown as PrismaTransactionClient)
      },
    )

    const result = await bootstrap(
      { familyName: 'Família Silva', name: 'João Silva' },
      kcClaims(),
    )

    expect(result.user.email).toBe('joao@exemplo.com')
    expect(result.user.role).toBe('ADMIN')
  })

  it('deve rejeitar e-mail duplicado com status 409', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockUserRow as never)

    await expect(bootstrap({ familyName: 'F', name: 'João' }, kcClaims())).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('deve rejeitar token sem e-mail utilizável', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    await expect(
      bootstrap({ familyName: 'F', name: 'João' }, kcClaims({ email: undefined, preferred_username: 'x' })),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('deve rejeitar e-mail não verificado quando explicitamente false', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    await expect(
      bootstrap({ familyName: 'F', name: 'João' }, kcClaims({ email_verified: false })),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('invite', () => {
  it('deve criar convite e enfileirar e-mail', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.familyInvite.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.familyInvite.create).mockResolvedValue({} as never)
    vi.mocked(prisma.family.findUniqueOrThrow).mockResolvedValue({ id: 'f1', name: 'Fam' } as never)
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ name: 'Admin' } as never)

    const result = await invite('family-1', 'admin-id', { email: 'novo@exemplo.com' })

    expect(result.token).toHaveLength(64)
    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-invite',
      expect.objectContaining({ to: 'novo@exemplo.com' }),
    )
  })

  it('deve rejeitar convite para e-mail já cadastrado', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUserRow as never)

    await expect(invite('family-1', 'admin-id', { email: 'joao@exemplo.com' })).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('acceptInvite', () => {
  it('deve criar MEMBER quando e-mail do token coincide com o convite', async () => {
    const inv = {
      id: 'inv-1',
      familyId: 'family-1',
      invitedById: 'admin',
      email: 'membro@exemplo.com',
      token: 'tok',
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
      createdAt: new Date(),
    }
    vi.mocked(prisma.familyInvite.findUnique).mockResolvedValue(inv as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.$transaction).mockImplementation(
      async (fn: (tx: PrismaTransactionClient) => Promise<unknown>) => {
        const member = {
          id: 'u2',
          familyId: 'family-1',
          name: 'Maria',
          email: 'membro@exemplo.com',
          passwordHash: null,
          keycloakSub: 'kc-sub-2',
          role: 'MEMBER',
          family: { id: 'family-1', name: 'Fam' },
        }
        const txMock = {
          user: { create: vi.fn().mockResolvedValue(member) },
          familyInvite: { update: vi.fn() },
        }
        return fn(txMock as unknown as PrismaTransactionClient)
      },
    )

    const result = await acceptInvite(
      'tok',
      { name: 'Maria' },
      kcClaims({ sub: 'kc-sub-2', email: 'membro@exemplo.com' }),
    )

    expect(result.user.role).toBe('MEMBER')
    expect(result.user.email).toBe('membro@exemplo.com')
  })

  it('deve rejeitar quando e-mail da sessão difere do convite', async () => {
    const inv = {
      id: 'inv-1',
      familyId: 'family-1',
      invitedById: 'admin',
      email: 'membro@exemplo.com',
      token: 'tok',
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
      createdAt: new Date(),
    }
    vi.mocked(prisma.familyInvite.findUnique).mockResolvedValue(inv as never)

    await expect(
      acceptInvite('tok', { name: 'Maria' }, kcClaims({ email: 'outro@exemplo.com' })),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('findAuthUserByKeycloakSub', () => {
  it('retorna null quando não há usuário', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    await expect(findAuthUserByKeycloakSub('x')).resolves.toBeNull()
  })

  it('retorna AuthUser quando encontrado', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUserRow as never)
    const u = await findAuthUserByKeycloakSub('kc-sub-1')
    expect(u?.id).toBe('user-1')
    expect(u?.entryPreferences.accountId).toBeNull()
  })
})

describe('updateUserEntryPreferences', () => {
  it('rejeita liquidação CARD sem cartão', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUserRow,
      entryDefaultAccountId: 'acc-1',
      entryDefaultCreditCardId: null,
      entryExpenseSettlement: null,
    } as never)
    await expect(
      updateUserEntryPreferences('user-1', 'family-1', { expenseSettlement: 'CARD' }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('atualiza e retorna preferências sanitizadas', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUserRow,
      entryDefaultAccountId: null,
      entryDefaultCreditCardId: null,
      entryExpenseSettlement: null,
    } as never)
    vi.mocked(prisma.account.findFirst).mockResolvedValue({
      id: 'acc-1',
      familyId: 'family-1',
      isActive: true,
    } as never)
    vi.mocked(prisma.creditCard.findFirst).mockResolvedValue({
      id: 'card-1',
      familyId: 'family-1',
      isActive: true,
    } as never)
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...mockUserRow,
      entryDefaultAccountId: 'acc-1',
      entryDefaultCreditCardId: 'card-1',
      entryExpenseSettlement: 'CARD',
      entryDefaultAccount: {
        id: 'acc-1',
        name: 'Conta A',
        isActive: true,
        familyId: 'family-1',
      },
      entryDefaultCreditCard: {
        id: 'card-1',
        name: 'Visa',
        isActive: true,
        familyId: 'family-1',
      },
    } as never)

    const prefs = await updateUserEntryPreferences('user-1', 'family-1', {
      accountId: 'acc-1',
      creditCardId: 'card-1',
      expenseSettlement: 'CARD',
    })
    expect(prefs.accountId).toBe('acc-1')
    expect(prefs.creditCardId).toBe('card-1')
    expect(prefs.expenseSettlement).toBe('CARD')
  })
})
