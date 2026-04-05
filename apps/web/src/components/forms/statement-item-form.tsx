'use client'

import { useForm } from 'react-hook-form'
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
import { formatDateInput } from '@/lib/utils'

const schema = z.object({
  accountId: z.string().min(1, 'Selecione uma conta'),
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.coerce.number().positive('Valor deve ser positivo'),
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
    create.mutate(data, {
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
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogHeader title="Adicionar Item Manual" onClose={onClose} />
        <DialogBody>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="si-account">Conta</Label>
              <Select id="si-account" {...register('accountId')}>
                <option value="">Selecione uma conta</option>
                {accounts?.map((a) => (
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
              <Label htmlFor="si-amount">Valor (R$)</Label>
              <Input
                id="si-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                {...register('amount')}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              )}
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
