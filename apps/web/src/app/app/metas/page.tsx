'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Target } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { GoalForm } from '@/components/forms/goal-form'
import { useGoals, useDeleteGoal, type Goal } from '@/hooks/use-goals'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function MetasPage() {
  const { data: goals, isLoading } = useGoals()
  const deleteGoal = useDeleteGoal()
  const { toast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteGoal.mutateAsync(deleteId)
      toast('Meta excluída', 'success')
    } catch {
      toast('Erro ao excluir meta', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Nova Meta
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center py-10 text-gray-500">Carregando...</p>
      ) : goals?.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Target className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">Nenhuma meta cadastrada</p>
            <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Criar meta</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals?.map((goal) => (
            <Card key={goal.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-gray-900">{goal.name}</p>
                    {goal.deadline && (
                      <p className="text-xs text-gray-500">Prazo: {formatDate(goal.deadline)}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" onClick={() => { setEditingGoal(goal); setShowForm(true) }}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500" onClick={() => setDeleteId(goal.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Progresso</span>
                    <span className="font-medium">{goal.progressPercent.toFixed(0)}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(goal.progressPercent, 100)}%`,
                        backgroundColor: goal.color ?? '#3b82f6',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{formatCurrency(goal.currentAmount)}</span>
                    <span>{formatCurrency(goal.targetAmount)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <GoalForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingGoal(undefined) }}
        goal={editingGoal}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Meta"
        description="Deseja excluir esta meta permanentemente?"
        isLoading={deleteGoal.isPending}
      />
    </div>
  )
}
