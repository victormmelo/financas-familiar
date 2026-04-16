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

export function findCategoryById(roots: CategoryTreeNode[], id: string): CategoryTreeNode | undefined {
  for (const node of roots) {
    if (node.id === id) return node
    if (node.children?.length) {
      const nested = findCategoryById(node.children, id)
      if (nested) return nested
    }
  }
  return undefined
}

/** Caminho de nomes da raiz até o nó `id`, se existir. */
export function findCategoryPathNames(roots: CategoryTreeNode[], id: string): string[] | undefined {
  function walk(nodes: CategoryTreeNode[], acc: string[]): string[] | undefined {
    for (const n of nodes) {
      const next = [...acc, n.name]
      if (n.id === id) return next
      if (n.children?.length) {
        const found = walk(n.children, next)
        if (found) return found
      }
    }
    return undefined
  }
  return walk(roots, [])
}

/**
 * Só categorias **folha** (sem filhos na árvore). Categorias “pai” não entram.
 * Filtra por tipo de movimento (INCOME/EXPENSE), incluindo BOTH.
 */
export function flattenLeafCategoriesForSelect(
  roots: CategoryTreeNode[],
  movement: CategoryMovementType,
): CategorySelectOption[] {
  const out: CategorySelectOption[] = []
  function collect(nodes: CategoryTreeNode[], pathNames: string[]): void {
    for (const node of nodes) {
      if (!categoryMatchesMovement(node.type, movement)) continue
      const nextPath = [...pathNames, node.name]
      const children = node.children ?? []
      if (children.length === 0) {
        out.push({ id: node.id, label: nextPath.join(' › ') })
      } else {
        collect(children, nextPath)
      }
    }
  }
  collect(roots, [])
  return out
}
