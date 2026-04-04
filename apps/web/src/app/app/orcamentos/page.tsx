'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { BudgetForm } from '@/components/forms/budget-form'
import { useBudgets, useDeleteBudget, type Budget } from '@/hooks/use-budgets'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, getMonthName, currentMonth } from '@/lib/utils'

export default function OrcamentosPage() {
  const { month: cm, year: cy } = currentMonth()
  const [month, setMonth] = useState(cm)
  const [year, setYear] = useState(cy)

  const { data: budgets, isLoading } = useBudgets({ referenceMonth: month, referenceYear: year })
  const deleteBudget = useDeleteBudget()
  const { toast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteBudget.mutateAsync(deleteId)
      toast('Orçamento excluído', 'success')
    } catch {
      toast('Erro ao excluir', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  const total = budgets?.reduce((s, b) => s + b.limitAmount, 0) ?? 0
  const totalSpent = budgets?.reduce((s, b) => s + b.spentAmount, 0) ?? 0

  return (
    <div className="space-y-6">
      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-lg hover:bg-gray-100" onClick={prevMonth}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 w-36 text-center">
            {getMonthName(month)} {year}
          </h2>
          <button className="p-2 rounded-lg hover:bg-gray-100" onClick={nextMonth}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Novo Orçamento
        </Button>
      </div>

      {/* Summary */}
      {budgets && budgets.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500">Total Orçado</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500">Total Gasto</p>
              <p className={`text-xl font-bold ${totalSpent > total ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(totalSpent)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500">Disponível</p>
              <p className={`text-xl font-bold ${total - totalSpent < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(total - totalSpent)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Budget list */}
      {isLoading ? (
        <p className="text-center py-10 text-gray-500">Carregando...</p>
      ) : budgets?.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-gray-500 mb-4">Nenhum orçamento para {getMonthName(month)} {year}</p>
            <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Criar orçamento</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {budgets?.map((b) => (
            <Card key={b.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{b.category?.name ?? '—'}</span>
                    {b.isOverBudget && <Badge variant="destructive">Excedido</Badge>}
                    {!b.isOverBudget && b.usagePercent >= 80 && <Badge variant="warning">Atenção</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">
                      {formatCurrency(b.spentAmount)} / {formatCurrency(b.limitAmount)}
                    </span>
                    <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" onClick={() => { setEditingBudget(b); setShowForm(true) }}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500" onClick={() => setDeleteId(b.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${b.isOverBudget ? 'bg-red-500' : b.usagePercent >= 80 ? 'bg-yellow-400' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(b.usagePercent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{b.usagePercent.toFixed(0)}% utilizado</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BudgetForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingBudget(undefined) }}
        budget={editingBudget}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Orçamento"
        description="Deseja excluir este orçamento?"
        isLoading={deleteBudget.isPending}
      />
    </div>
  )
}
