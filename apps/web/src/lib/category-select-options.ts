/** Tipo de movimento em transação (categorias BOTH entram nos dois). */
export type CategoryMovementType = 'INCOME' | 'EXPENSE'

export interface CategoryTreeNode {
  id: string
  name: string
  type: 'INCOME' | 'EXPENSE' | 'BOTH'
  children?: CategoryTreeNode[]
}

export function categoryMatchesMovement(
  type: 'INCOME' | 'EXPENSE' | 'BOTH',
  movement: CategoryMovementType,
): boolean {
  return type === movement || type === 'BOTH'
}

export interface CategorySelectOption {
  id: string
  label: string
}

/**
 * Lista achatada raiz + subcategorias para `<option>`, com rótulo "Pai › Filho".
 * Filtra por tipo de movimento (INCOME/EXPENSE), incluindo categorias BOTH.
 */
export function flattenCategoriesForSelect(
  roots: CategoryTreeNode[],
  movement: CategoryMovementType,
): CategorySelectOption[] {
  const out: CategorySelectOption[] = []
  for (const root of roots) {
    if (!categoryMatchesMovement(root.type, movement)) continue
    out.push({ id: root.id, label: root.name })
    for (const child of root.children ?? []) {
      if (!categoryMatchesMovement(child.type, movement)) continue
      out.push({ id: child.id, label: `${root.name} › ${child.name}` })
    }
  }
  return out
}

/** Orçamentos: apenas categorias de despesa (ou BOTH), raiz e sub. */
export function flattenExpenseCategoriesForSelect(roots: CategoryTreeNode[]): CategorySelectOption[] {
  return flattenCategoriesForSelect(roots, 'EXPENSE')
}
