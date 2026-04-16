import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    category: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      count: vi.fn(),
    },
  },
}))

import { prisma } from '../../lib/prisma.js'
import { createCategory, updateCategory, deleteCategory } from './categories.service.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createCategory', () => {
  it('cria categoria raiz sem consultar pai', async () => {
    vi.mocked(prisma.category.create).mockResolvedValue({ id: 'new-1' } as never)

    await createCategory('family-1', {
      name: 'X',
      type: 'EXPENSE',
    })

    expect(prisma.category.findFirst).not.toHaveBeenCalled()
    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: undefined, name: 'X', type: 'EXPENSE' }),
      }),
    )
  })

  it('cria subcategoria quando pai é raiz e tipos coincidem', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: 'root-1',
      familyId: 'family-1',
      parentId: null,
      type: 'EXPENSE',
    } as never)
    vi.mocked(prisma.category.create).mockResolvedValue({ id: 'sub-1' } as never)

    await createCategory('family-1', {
      name: 'Restaurante',
      type: 'EXPENSE',
      parentId: 'root-1',
    })

    expect(prisma.category.create).toHaveBeenCalled()
  })

  it('rejeita pai que não é raiz', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: 'mid-1',
      familyId: 'family-1',
      parentId: 'root-1',
      type: 'EXPENSE',
    } as never)

    await expect(
      createCategory('family-1', {
        name: 'Filho',
        type: 'EXPENSE',
        parentId: 'mid-1',
      }),
    ).rejects.toEqual(expect.objectContaining({ statusCode: 400 }))
    expect(prisma.category.create).not.toHaveBeenCalled()
  })

  it('rejeita quando tipo do filho difere do pai', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: 'root-1',
      familyId: 'family-1',
      parentId: null,
      type: 'EXPENSE',
    } as never)

    await expect(
      createCategory('family-1', {
        name: 'Salário errado',
        type: 'INCOME',
        parentId: 'root-1',
      }),
    ).rejects.toEqual(expect.objectContaining({ statusCode: 400 }))
    expect(prisma.category.create).not.toHaveBeenCalled()
  })
})

describe('updateCategory', () => {
  it('promove subcategoria com parentId null', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: 'sub-1',
      familyId: 'family-1',
      parentId: 'root-1',
      type: 'EXPENSE',
      name: 'Sub',
    } as never)
    vi.mocked(prisma.category.update).mockResolvedValue({ id: 'sub-1', parentId: null } as never)

    await updateCategory('family-1', 'sub-1', { parentId: null })

    expect(prisma.category.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ parentId: null }),
      }),
    )
  })

  it('bloqueia raiz com filhos de virar subcategoria', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: 'root-1',
      familyId: 'family-1',
      parentId: null,
      type: 'EXPENSE',
      name: 'Alimentação',
    } as never)
    vi.mocked(prisma.category.count).mockResolvedValue(2)

    await expect(
      updateCategory('family-1', 'root-1', { parentId: 'root-2' }),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(prisma.category.update).not.toHaveBeenCalled()
  })

  it('permite raiz sem filhos virar subcategoria', async () => {
    const root1 = {
      id: 'root-1',
      familyId: 'family-1',
      parentId: null,
      type: 'EXPENSE',
      name: 'Antiga raiz',
    }
    const root2 = {
      id: 'root-2',
      familyId: 'family-1',
      parentId: null,
      type: 'EXPENSE',
      name: 'Novo pai',
    }
    vi.mocked(prisma.category.findFirst)
      .mockResolvedValueOnce(root1 as never)
      .mockResolvedValueOnce(root2 as never)
    vi.mocked(prisma.category.count).mockResolvedValue(0)
    vi.mocked(prisma.category.update).mockResolvedValue({ ...root1, parentId: 'root-2' } as never)

    await updateCategory('family-1', 'root-1', { parentId: 'root-2' })

    expect(prisma.category.update).toHaveBeenCalled()
  })

  it('rejeita parentId igual ao próprio id', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: 'cat-1',
      familyId: 'family-1',
      parentId: null,
      type: 'EXPENSE',
    } as never)

    await expect(updateCategory('family-1', 'cat-1', { parentId: 'cat-1' })).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('rejeita alteração de tipo incompatível com pai atual', async () => {
    vi.mocked(prisma.category.findFirst)
      .mockResolvedValueOnce({
        id: 'sub-1',
        familyId: 'family-1',
        parentId: 'root-1',
        type: 'EXPENSE',
      } as never)
      .mockResolvedValueOnce({
        id: 'root-1',
        familyId: 'family-1',
        parentId: null,
        type: 'EXPENSE',
      } as never)

    await expect(updateCategory('family-1', 'sub-1', { type: 'INCOME' })).rejects.toEqual(
      expect.objectContaining({ statusCode: 400 }),
    )
  })
})

describe('deleteCategory', () => {
  it('reassign subcategorias e remove', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: 'root-1',
      familyId: 'family-1',
    } as never)
    vi.mocked(prisma.transaction.count).mockResolvedValue(0)
    vi.mocked(prisma.category.updateMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(prisma.category.delete).mockResolvedValue({ id: 'root-1' } as never)

    await deleteCategory('family-1', 'root-1')

    expect(prisma.category.updateMany).toHaveBeenCalledWith({
      where: { parentId: 'root-1' },
      data: { parentId: null },
    })
    expect(prisma.category.delete).toHaveBeenCalled()
  })
})
