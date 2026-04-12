'use client'

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useCreateTransfer } from '@/hooks/use-transfers'
import { useAccounts } from '@/hooks/use-accounts'
import { useToast } from '@/components/ui/toast'
import { MoneyBrlInput } from '@/components/forms/money-brl-input'
import { formatDateInput } from '@/lib/utils'
import { normalizeReaisForApi } from '@financas/shared-types'

const schema = z
  .object({
    fromAccountId: z.string().min(1, 'Selecione a conta de origem'),
    toAccountId: z.string().min(1, 'Selecione a conta de destino'),
    amount: z
      .number({ invalid_type_error: 'Informe o valor' })
      .positive('Valor deve ser positivo'),
    description: z.string().optional(),
    date: z.string().min(1, 'Data obrigatória'),
  })
  .refine((d) => d.fromAccountId !== d.toAccountId, {
    message: 'Contas devem ser diferentes',
    path: ['toAccountId'],
  })

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
}

export function TransferForm({ open, onClose }: Props) {
  const create = useCreateTransfer()
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
    defaultValues: { date: formatDateInput(new Date()) },
  })

  async function onSubmit(data: FormData) {
    try {
      await create.mutateAsync({ ...data, amount: normalizeReaisForApi(data.amount) })
      toast('Transferência realizada!', 'success')
      reset()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao realizar transferência', 'error')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md" preventClose={isSubmitting}>
      <DialogHeader title="Nova Transferência" onClose={onClose} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Conta de Origem</Label>
            <Select error={errors.fromAccountId?.message} {...register('fromAccountId')}>
              <option value="">Selecione</option>
              {accounts?.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Conta de Destino</Label>
            <Select error={errors.toAccountId?.message} {...register('toAccountId')}>
              <option value="">Selecione</option>
              {accounts?.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor</Label>
            <Controller
              name="amount"
              control={control}
              render={({ field }) => (
                <MoneyBrlInput
                  placeholder="0,00"
                  error={errors.amount?.message}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  aria-describedby="transfer-amount-hint"
                />
              )}
            />
            <p id="transfer-amount-hint" className="sr-only">
              Valor em reais (BRL), duas casas decimais.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" error={errors.date?.message} {...register('date')} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Input placeholder="Ex: Pagamento de conta..." {...register('description')} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSubmitting}>Transferir</Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
