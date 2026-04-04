'use client'

import { useForm } from 'react-hook-form'
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
import { formatDateInput } from '@/lib/utils'

const schema = z
  .object({
    fromAccountId: z.string().min(1, 'Selecione a conta de origem'),
    toAccountId: z.string().min(1, 'Selecione a conta de destino'),
    amount: z.coerce.number().positive('Valor deve ser positivo'),
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
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: formatDateInput(new Date()) },
  })

  async function onSubmit(data: FormData) {
    try {
      await create.mutateAsync(data)
      toast('Transferência realizada!', 'success')
      reset()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao realizar transferência', 'error')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      <DialogHeader title="Nova Transferência" onClose={onClose} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Conta de Origem</Label>
            <Select error={errors.fromAccountId?.message} {...register('fromAccountId')}>
              <option value="">Selecione</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Conta de Destino</Label>
            <Select error={errors.toAccountId?.message} {...register('toAccountId')}>
              <option value="">Selecione</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" placeholder="0,00" error={errors.amount?.message} {...register('amount')} />
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
