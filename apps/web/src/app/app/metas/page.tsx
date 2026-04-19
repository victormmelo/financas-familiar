'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Target } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { GoalForm } from '@/components/forms/goal-form'
import { useGoals, useDeleteGoal, type Goal } from '@/hooks/use-goals'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatCalendarDate } from '@/lib/utils'

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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Nova Meta
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2 w-full rounded-full" />
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : goals?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-full bg-muted p-4">
              <Target className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Nenhuma meta cadastrada</p>
              <p className="text-sm text-muted-foreground">Defina objetivos financeiros e acompanhe seu progresso</p>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Criar meta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals?.map((goal) => (
            <Card key={goal.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-foreground">{goal.name}</p>
                    {goal.deadline && (
                      <p className="text-xs text-muted-foreground">Prazo: {formatCalendarDate(goal.deadline)}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground" onClick={() => { setEditingGoal(goal); setShowForm(true) }}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-rose-600" onClick={() => setDeleteId(goal.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-medium text-foreground">{goal.progressPercent.toFixed(0)}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(goal.progressPercent, 100)}%`,
                        backgroundColor: goal.color ?? '#6366f1',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">{formatCurrency(goal.currentAmount)}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(goal.targetAmount)}</span>
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
