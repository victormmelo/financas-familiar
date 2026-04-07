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
import { useCategories } from '@/hooks/use-categories'
import { useCreateTransaction, useUpdateTransaction, type Transaction } from '@/hooks/use-transactions'
import { useToast } from '@/components/ui/toast'
import { formatDateInput } from '@/lib/utils'

const schema = z.object({
  accountId: z.string().min(1, 'Selecione uma conta'),
  categoryId: z.string().optional(),
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.coerce.number().positive('Valor deve ser positivo'),
  description: z.string().min(1, 'Descrição obrigatória'),
  notes: z.string().optional(),
  date: z.string().min(1, 'Data obrigatória'),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  transaction?: Transaction
}

export function TransactionForm({ open, onClose, transaction }: Props) {
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: transaction
      ? {
          accountId: transaction.accountId,
          categoryId: transaction.categoryId ?? '',
          type: transaction.type,
          amount: transaction.amount,
          description: transaction.description,
          notes: transaction.notes ?? '',
          date: transaction.date,
        }
      : {
          type: 'EXPENSE',
          date: formatDateInput(new Date()),
        },
  })

  const selectedType = watch('type')

  const filteredCategories = categories?.filter(
    (c) => c.type === selectedType || c.type === 'BOTH',
  )

  async function onSubmit(data: FormData) {
    try {
      if (transaction) {
        await update.mutateAsync({
          id: transaction.id,
          categoryId: data.categoryId || null,
          amount: data.amount,
          description: data.description,
          notes: data.notes || null,
          date: data.date,
        })
        toast('Transação atualizada!', 'success')
      } else {
        await create.mutateAsync({
          ...data,
          categoryId: data.categoryId || undefined,
          source: 'MANUAL',
        })
        toast('Transação criada!', 'success')
      }
      reset()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar transação', 'error')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} preventClose={isSubmitting}>
      <DialogHeader title={transaction ? 'Editar Transação' : 'Nova Transação'} onClose={onClose} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select error={errors.type?.message} {...register('type')}>
                <option value="EXPENSE">Despesa</option>
                <option value="INCOME">Receita</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                error={errors.amount?.message}
                {...register('amount')}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input
              placeholder="Ex: Mercado, Salário..."
              error={errors.description?.message}
              {...register('description')}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Conta</Label>
            <Select error={errors.accountId?.message} {...register('accountId')}>
              <option value="">Selecione uma conta</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select {...register('categoryId')}>
              <option value="">Sem categoria</option>
              {filteredCategories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" error={errors.date?.message} {...register('date')} />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Input placeholder="Opcional..." {...register('notes')} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {transaction ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
