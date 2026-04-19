'use client'

import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { MoneyBrlInput } from '@/components/forms/money-brl-input'
import { normalizeReaisForApi } from '@financas/shared-types'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  targetAmount: z
    .number({ invalid_type_error: 'Informe o valor alvo' })
    .positive('Valor alvo obrigatório'),
  currentAmount: z.number({ invalid_type_error: 'Informe o valor atual' }).min(0).default(0),
  deadline: z.string().optional(),
  accountId: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function deadlineForDateInput(deadline?: string) {
  if (!deadline) return ''
  return deadline.length >= 10 ? deadline.slice(0, 10) : deadline
}

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
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      targetAmount: undefined as unknown as number,
      currentAmount: 0,
      deadline: '',
      accountId: '',
    },
  })

  useEffect(() => {
    if (!open) return
    if (goal) {
      reset({
        name: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        deadline: deadlineForDateInput(goal.deadline),
        accountId: goal.accountId ?? '',
      })
    } else {
      reset({
        name: '',
        targetAmount: undefined as unknown as number,
        currentAmount: 0,
        deadline: '',
        accountId: '',
      })
    }
  }, [open, goal, reset])

  async function onSubmit(data: FormData) {
    try {
      if (goal) {
        await update.mutateAsync({
          id: goal.id,
          ...data,
          targetAmount: normalizeReaisForApi(data.targetAmount),
          currentAmount: normalizeReaisForApi(data.currentAmount),
          accountId: data.accountId || null,
          deadline: data.deadline || null,
        })
        toast('Meta atualizada!', 'success')
      } else {
        await create.mutateAsync({
          ...data,
          targetAmount: normalizeReaisForApi(data.targetAmount),
          currentAmount: normalizeReaisForApi(data.currentAmount),
          accountId: data.accountId || undefined,
          deadline: data.deadline || undefined,
        })
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
              <Label>Valor alvo</Label>
              <Controller
                name="targetAmount"
                control={control}
                render={({ field }) => (
                  <MoneyBrlInput
                    placeholder="10.000,00"
                    error={errors.targetAmount?.message}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    aria-describedby="goal-target-hint"
                  />
                )}
              />
              <p id="goal-target-hint" className="sr-only">
                Valor em reais (BRL), duas casas decimais.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Valor atual</Label>
              <Controller
                name="currentAmount"
                control={control}
                render={({ field }) => (
                  <MoneyBrlInput
                    placeholder="0,00"
                    error={errors.currentAmount?.message}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    aria-describedby="goal-current-hint"
                  />
                )}
              />
              <p id="goal-current-hint" className="sr-only">
                Valor em reais (BRL), duas casas decimais.
              </p>
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
              {accounts?.filter((a) => a.isActive).map((a) => (
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
