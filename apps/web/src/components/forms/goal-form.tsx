'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useCreateGoal, useUpdateGoal, type Goal } from '@/hooks/use-goals'
import { useAccounts } from '@/hooks/use-accounts'
import { useToast } from '@/components/ui/toast'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  targetAmount: z.coerce.number().positive('Valor alvo obrigatório'),
  currentAmount: z.coerce.number().min(0).default(0),
  deadline: z.string().optional(),
  accountId: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  goal?: Goal
}

export function GoalForm({ open, onClose, goal }: Props) {
  const create = useCreateGoal()
  const update = useUpdateGoal()
  const { data: accounts } = useAccounts()
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: goal
      ? { name: goal.name, targetAmount: goal.targetAmount, currentAmount: goal.currentAmount, deadline: goal.deadline, accountId: goal.accountId }
      : { currentAmount: 0 },
  })

  async function onSubmit(data: FormData) {
    try {
      if (goal) {
        await update.mutateAsync({ id: goal.id, ...data, accountId: data.accountId || null, deadline: data.deadline || null })
        toast('Meta atualizada!', 'success')
      } else {
        await create.mutateAsync({ ...data, accountId: data.accountId || undefined, deadline: data.deadline || undefined })
        toast('Meta criada!', 'success')
      }
      reset()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar meta', 'error')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md" preventClose={isSubmitting}>
      <DialogHeader title={goal ? 'Editar Meta' : 'Nova Meta'} onClose={onClose} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input placeholder="Ex: Viagem, Reserva de emergência..." error={errors.name?.message} {...register('name')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valor Alvo (R$)</Label>
              <Input type="number" step="0.01" placeholder="10000,00" error={errors.targetAmount?.message} {...register('targetAmount')} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor Atual (R$)</Label>
              <Input type="number" step="0.01" placeholder="0,00" error={errors.currentAmount?.message} {...register('currentAmount')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo</Label>
            <Input type="date" {...register('deadline')} />
          </div>
          <div className="space-y-1.5">
            <Label>Conta Vinculada (opcional)</Label>
            <Select {...register('accountId')}>
              <option value="">Nenhuma</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSubmitting}>{goal ? 'Salvar' : 'Criar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
