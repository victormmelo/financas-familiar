import { prisma } from '../../lib/prisma.js'
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schema.js'

type CategoryType = CreateCategoryInput['type']

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode })
}

/** Pai deve ser raiz da família e ter o mesmo tipo que o filho (regra estrita). */
async function assertParentValidForSubcategory(
  familyId: string,
  parentId: string,
  childType: CategoryType,
): Promise<void> {
  const parent = await prisma.category.findFirst({
    where: { id: parentId, familyId },
  })
  if (!parent) throw httpError('Categoria pai não encontrada', 404)
  if (parent.parentId !== null) {
    throw httpError(
      'A categoria pai deve ser uma categoria raiz; não é permitido aninhar subcategorias.',
      400,
    )
  }
  if (parent.type !== childType) {
    throw httpError(
      'Subcategoria deve ter o mesmo tipo que a categoria pai (incluindo BOTH apenas com pai BOTH).',
      400,
    )
  }
}

export async function listCategories(familyId: string) {
  return prisma.category.findMany({
    where: { familyId, parentId: null },
    include: {
      subcategories: {
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })
}

export async function toggleCategory(familyId: string, categoryId: string, isActive: boolean) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, familyId } })
  if (!category) throw httpError('Categoria não encontrada', 404)

  return prisma.category.update({
    where: { id: categoryId },
    data: { isActive },
  })
}

export async function createCategory(familyId: string, input: CreateCategoryInput) {
  if (input.parentId) {
    await assertParentValidForSubcategory(familyId, input.parentId, input.type)
  }

  return prisma.category.create({
    data: {
      familyId,
      name: input.name,
      type: input.type,
      parentId: input.parentId,
      icon: input.icon,
      color: input.color,
    },
  })
}

export async function updateCategory(familyId: string, categoryId: string, input: UpdateCategoryInput) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, familyId } })
  if (!category) throw httpError('Categoria não encontrada', 404)

  const nextType: CategoryType = input.type !== undefined ? input.type : category.type
  const nextParentId: string | null =
    input.parentId !== undefined ? input.parentId : category.parentId

  if (typeof input.parentId === 'string' && input.parentId === categoryId) {
    throw httpError('Uma categoria não pode ser pai de si mesma.', 400)
  }

  if (nextParentId !== null) {
    await assertParentValidForSubcategory(familyId, nextParentId, nextType)
  }

  // Raiz com filhos não pode virar subcategoria (evitar netos).
  if (nextParentId !== null && category.parentId === null) {
    const childCount = await prisma.category.count({ where: { parentId: categoryId } })
    if (childCount > 0) {
      throw httpError(
        'Não é possível tornar esta categoria em subcategoria enquanto existirem subcategorias vinculadas a ela.',
        400,
      )
    }
  }

  return prisma.category.update({
    where: { id: categoryId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  })
}

export async function deleteCategory(familyId: string, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, familyId } })
  if (!category) throw httpError('Categoria não encontrada', 404)

  const usageCount = await prisma.transaction.count({ where: { categoryId } })
  if (usageCount > 0) {
    throw httpError('Não é possível excluir categoria com transações vinculadas', 409)
  }

  // Reassign subcategories to root
  await prisma.category.updateMany({
    where: { parentId: categoryId },
    data: { parentId: null },
  })

  return prisma.category.delete({ where: { id: categoryId } })
}
