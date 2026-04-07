import { prisma } from '../../lib/prisma.js'
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schema.js'

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
  if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })

  return prisma.category.update({
    where: { id: categoryId },
    data: { isActive },
  })
}

export async function createCategory(familyId: string, input: CreateCategoryInput) {
  if (input.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: input.parentId, familyId },
    })
    if (!parent) throw Object.assign(new Error('Categoria pai não encontrada'), { statusCode: 404 })
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
  if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })

  return prisma.category.update({
    where: { id: categoryId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  })
}

export async function deleteCategory(familyId: string, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, familyId } })
  if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })

  const usageCount = await prisma.transaction.count({ where: { categoryId } })
  if (usageCount > 0) {
    throw Object.assign(
      new Error('Não é possível excluir categoria com transações vinculadas'),
      { statusCode: 409 },
    )
  }

  // Reassign subcategories to root
  await prisma.category.updateMany({
    where: { parentId: categoryId },
    data: { parentId: null },
  })

  return prisma.category.delete({ where: { id: categoryId } })
}
