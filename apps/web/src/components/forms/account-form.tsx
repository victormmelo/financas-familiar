'use client'

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useCreateAccount, useUpdateAccount, type Account } from '@/hooks/use-accounts'
import { useToast } from '@/components/ui/toast'
import { MoneyBrlInput } from '@/components/forms/money-brl-input'
import { normalizeReaisForApi } from '@financas/shared-types'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: z.enum(['CHECKING', 'SAVINGS', 'JOINT', 'INVESTMENT', 'CASH']),
  initialBalance: z.number({ invalid_type_error: 'Informe o saldo inicial' }).min(0).default(0),
  color: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  account?: Account
}

export function AccountForm({ open, onClose, account }: Props) {
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const { toast } = useToast()

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: account
      ? { name: account.name, type: account.type, initialBalance: account.initialBalance, color: account.color }
      : { type: 'CHECKING', initialBalance: 0 },
  })

  async function onSubmit(data: FormData) {
    try {
      if (account) {
        await update.mutateAsync({ id: account.id, name: data.name, type: data.type, color: data.color })
        toast('Conta atualizada!', 'success')
      } else {
        await create.mutateAsync({
          ...data,
          initialBalance: normalizeReaisForApi(data.initialBalance),
        })
        toast('Conta criada!', 'success')
      }
      reset()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar conta', 'error')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md" preventClose={isSubmitting}>
      <DialogHeader title={account ? 'Editar Conta' : 'Nova Conta'} onClose={onClose} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da Conta</Label>
            <Input placeholder="Ex: Nubank, Bradesco..." error={errors.name?.message} {...register('name')} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select error={errors.type?.message} {...register('type')}>
              <option value="CHECKING">Conta Corrente</option>
              <option value="SAVINGS">Poupança</option>
              <option value="JOINT">Conta Conjunta</option>
              <option value="INVESTMENT">Investimento</option>
              <option value="CASH">Dinheiro</option>
            </Select>
          </div>
          {!account && (
            <div className="space-y-1.5">
              <Label>Saldo inicial</Label>
              <Controller
                name="initialBalance"
                control={control}
                render={({ field }) => (
                  <MoneyBrlInput
                    placeholder="0,00"
                    error={errors.initialBalance?.message}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    aria-describedby="account-initial-balance-hint"
                  />
                )}
              />
              <p id="account-initial-balance-hint" className="sr-only">
                Valor em reais (BRL), duas casas decimais.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Cor (hex)</Label>
            <Input type="color" className="h-10 px-1 py-1" {...register('color')} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSubmitting}>{account ? 'Salvar' : 'Criar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
