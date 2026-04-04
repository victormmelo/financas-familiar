'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useCreateBudget, useUpdateBudget, type Budget } from '@/hooks/use-budgets'
import { useCategories } from '@/hooks/use-categories'
import { useToast } from '@/components/ui/toast'
import { currentMonth } from '@/lib/utils'

const schema = z.object({
  categoryId: z.string().min(1, 'Selecione uma categoria'),
  referenceMonth: z.coerce.number().int().min(1).max(12),
  referenceYear: z.coerce.number().int().min(2000),
  limitAmount: z.coerce.number().positive('Limite obrigatório'),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  budget?: Budget
}

export function BudgetForm({ open, onClose, budget }: Props) {
  const create = useCreateBudget()
  const update = useUpdateBudget()
  const { data: categories } = useCategories()
  const { toast } = useToast()
  const { month, year } = currentMonth()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: budget
      ? { categoryId: budget.categoryId, referenceMonth: budget.referenceMonth, referenceYear: budget.referenceYear, limitAmount: budget.limitAmount }
      : { referenceMonth: month, referenceYear: year },
  })

  async function onSubmit(data: FormData) {
    try {
      if (budget) {
        await update.mutateAsync({ id: budget.id, limitAmount: data.limitAmount })
        toast('Orçamento atualizado!', 'success')
      } else {
        await create.mutateAsync(data)
        toast('Orçamento criado!', 'success')
      }
      reset()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar orçamento', 'error')
    }
  }

  const expenseCategories = categories?.filter((c) => c.type === 'EXPENSE' || c.type === 'BOTH')

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      <DialogHeader title={budget ? 'Editar Orçamento' : 'Novo Orçamento'} onClose={onClose} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select error={errors.categoryId?.message} {...register('categoryId')} disabled={!!budget}>
              <option value="">Selecione uma categoria</option>
              {expenseCategories?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Mês</Label>
              <Input type="number" min="1" max="12" error={errors.referenceMonth?.message} {...register('referenceMonth')} disabled={!!budget} />
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input type="number" min="2000" max="2100" error={errors.referenceYear?.message} {...register('referenceYear')} disabled={!!budget} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Limite (R$)</Label>
            <Input type="number" step="0.01" placeholder="500,00" error={errors.limitAmount?.message} {...register('limitAmount')} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSubmitting}>{budget ? 'Salvar' : 'Criar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
