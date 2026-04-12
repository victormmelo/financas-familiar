'use client'

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useAccounts } from '@/hooks/use-accounts'
import { useCreateStatementItem } from '@/hooks/use-reconciliation'
import { useToast } from '@/components/ui/toast'
import { MoneyBrlInput } from '@/components/forms/money-brl-input'
import { formatDateInput } from '@/lib/utils'
import { normalizeReaisForApi } from '@financas/shared-types'

const schema = z.object({
  accountId: z.string().min(1, 'Selecione uma conta'),
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z
    .number({ invalid_type_error: 'Informe o valor' })
    .positive('Valor deve ser positivo'),
  description: z.string().min(1, 'Descrição obrigatória'),
  date: z.string().min(1, 'Data obrigatória'),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  defaultAccountId?: string
}

export function StatementItemForm({ open, onClose, defaultAccountId }: Props) {
  const { data: accounts } = useAccounts()
  const create = useCreateStatementItem()
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
      accountId: defaultAccountId ?? '',
      type: 'EXPENSE',
      date: formatDateInput(new Date()),
    },
  })

  function onSubmit(data: FormData) {
    create.mutate(
      { ...data, amount: normalizeReaisForApi(data.amount) },
      {
      onSuccess: () => {
        toast('Item adicionado ao extrato', 'success')
        reset()
        onClose()
      },
      onError: (err) => {
        toast(err.message ?? 'Erro ao adicionar item', 'error')
      },
    })
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md" preventClose={isSubmitting}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <DialogHeader title="Adicionar Item Manual" onClose={onClose} />
        <DialogBody>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="si-account">Conta</Label>
              <Select id="si-account" {...register('accountId')}>
                <option value="">Selecione uma conta</option>
                {accounts?.filter((a) => a.isActive).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              {errors.accountId && (
                <p className="text-xs text-destructive">{errors.accountId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="si-type">Tipo</Label>
              <Select id="si-type" {...register('type')}>
                <option value="EXPENSE">Débito (saída)</option>
                <option value="INCOME">Crédito (entrada)</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="si-amount">Valor</Label>
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <MoneyBrlInput
                    id="si-amount"
                    placeholder="0,00"
                    error={errors.amount?.message}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    aria-describedby="si-amount-hint"
                  />
                )}
              />
              <p id="si-amount-hint" className="sr-only">
                Valor em reais (BRL), duas casas decimais.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="si-description">Descrição</Label>
              <Input
                id="si-description"
                placeholder="Ex: Supermercado Extra"
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="si-date">Data</Label>
              <Input id="si-date" type="date" {...register('date')} />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date.message}</p>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || create.isPending}>
            {create.isPending ? 'Salvando...' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
