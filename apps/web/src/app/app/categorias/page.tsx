'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Tags, Power } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryForm } from '@/components/forms/category-form'
import { useCategories, useDeleteCategory, useUpdateCategory, type Category } from '@/hooks/use-categories'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/components/ui/toast'
import { getCategoryTypeLabel } from '@/lib/utils'

export default function CategoriasPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ADMIN'

  const { data: categories, isLoading } = useCategories()
  const deleteCategory = useDeleteCategory()
  const updateCategory = useUpdateCategory()
  const { toast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteCategory.mutateAsync(deleteId)
      toast('Categoria excluída', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao excluir', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  async function toggleActive(cat: Category) {
    try {
      await updateCategory.mutateAsync({ id: cat.id, isActive: !cat.isActive })
      toast(cat.isActive ? 'Categoria desativada' : 'Categoria ativada', 'success')
    } catch {
      toast('Erro ao atualizar categoria', 'error')
    }
  }

  const roots = categories ?? []
  const active = roots.filter((c) => c.isActive)
  const inactive = roots.filter((c) => !c.isActive)

  return (
    <div className="flex flex-col gap-8 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Categorias raiz da família</span>
          <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">{active.length}</span>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground max-w-md">
              Apenas administradores podem criar, editar ou excluir categorias.
            </p>
          )}
        </div>
        {isAdmin && (
          <Button
            onClick={() => {
              setEditingCategory(undefined)
              setShowForm(true)
            }}
          >
            <Plus className="h-4 w-4" /> Nova Categoria
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-12 w-full mb-4" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Active categories */}
          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((cat) => (
                <CategoryRootCard
                  key={cat.id}
                  category={cat}
                  isAdmin={isAdmin}
                  onEdit={(c) => { setEditingCategory(c); setShowForm(true) }}
                  onDelete={(id) => setDeleteId(id)}
                  onToggle={toggleActive}
                />
              ))}
            </div>
          )}

          {/* Inactive categories */}
          {inactive.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Categorias Inativas
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {inactive.map((cat) => (
                  <CategoryRootCard
                    key={cat.id}
                    category={cat}
                    isAdmin={isAdmin}
                    onEdit={(c) => { setEditingCategory(c); setShowForm(true) }}
                    onDelete={(id) => setDeleteId(id)}
                    onToggle={toggleActive}
                  />
                ))}
              </div>
            </div>
          )}

          {roots.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="rounded-sm bg-muted p-4 border border-border">
                  <Tags className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Nenhuma categoria cadastrada</p>
                  <p className="text-xs text-muted-foreground mt-1">Crie categorias para classificar transações e orçamentos</p>
                </div>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditingCategory(undefined); setShowForm(true) }}
                  >
                    <Plus className="h-4 w-4" /> Criar primeira categoria
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <CategoryForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingCategory(undefined) }}
        category={editingCategory}
        parentCategories={roots}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir categoria"
        description="Subcategorias desta categoria passarão para o nível raiz. Não é possível excluir se existirem transações vinculadas. Deseja continuar?"
        isLoading={deleteCategory.isPending}
      />
    </div>
  )
}

function CategoryRootCard({
  category,
  isAdmin,
  onEdit,
  onDelete,
  onToggle,
}: {
  category: Category
  isAdmin: boolean
  onEdit: (c: Category) => void
  onDelete: (id: string) => void
  onToggle: (c: Category) => void
}) {
  const children = category.children ?? []
  const swatch = category.color ?? '#6366f1'

  return (
    <Card className={category.isActive ? '' : 'opacity-60'}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: swatch }}
            >
              {category.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{category.name}</p>
              <Badge variant="secondary" className="mt-0.5 text-xs">
                {getCategoryTypeLabel(category.type)}
              </Badge>
            </div>
          </div>
          {!category.isActive && (
            <Badge className="shrink-0 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[#2A1212] text-[#F08D8D] border border-[#7A2A2A]">
              Inativa
            </Badge>
          )}
        </div>

        {children.length > 0 && (
          <ul className="mb-3 space-y-2 border-t border-border pt-3">
            {children.map((sub) => (
              <li key={sub.id} className={`flex items-center justify-between gap-2 text-sm ${sub.isActive ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sub.color ?? swatch }} />
                  <span className="truncate text-foreground">{sub.name}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                    {getCategoryTypeLabel(sub.type)}
                  </Badge>
                  {!sub.isActive && (
                    <Badge className="shrink-0 rounded-sm px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide bg-[#2A1212] text-[#F08D8D] border border-[#7A2A2A]">
                      Inativa
                    </Badge>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      onClick={() => onEdit(sub)}
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-amber-600"
                      onClick={() => onToggle(sub)}
                      title={sub.isActive ? 'Desativar' : 'Ativar'}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-rose-600"
                      onClick={() => onDelete(sub.id)}
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin && (
          <div className="flex items-center gap-1 justify-end border-t border-border pt-3">
            <button
              type="button"
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(category)}
              title="Editar"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-amber-600"
              onClick={() => onToggle(category)}
              title={category.isActive ? 'Desativar' : 'Ativar'}
            >
              <Power className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-rose-600"
              onClick={() => onDelete(category.id)}
              title="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
