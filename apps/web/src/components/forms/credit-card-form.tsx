'use client'

import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useCreateCreditCard, useUpdateCreditCard, type CreditCard } from '@/hooks/use-credit-cards'
import { useAccounts } from '@/hooks/use-accounts'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { MoneyBrlInput } from '@/components/forms/money-brl-input'
import { normalizeReaisForApi } from '@financas/shared-types'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  limit: z
    .number({ invalid_type_error: 'Informe o limite' })
    .positive('Limite obrigatório'),
  closingDay: z.coerce.number().int().min(1).max(31),
  dueDay: z.coerce.number().int().min(1).max(31),
  defaultAccountId: z.string().min(1, 'Selecione a conta padrão'),
  color: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  card?: CreditCard
}

export function CreditCardForm({ open, onClose, card }: Props) {
  const create = useCreateCreditCard()
  const update = useUpdateCreditCard()
  const { toast } = useToast()
  const { data: accounts } = useAccounts()

  const selectableAccounts = (accounts ?? []).filter((a) => a.isActive || (card && a.id === card.defaultAccountId))

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: card
      ? {
          name: card.name,
          limit: card.limit,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          defaultAccountId: card.defaultAccountId ?? '',
          color: card.color ?? undefined,
        }
      : { closingDay: 1, dueDay: 10, defaultAccountId: '' },
  })

  useEffect(() => {
    if (!open) return
    if (card) {
      reset({
        name: card.name,
        limit: card.limit,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        defaultAccountId: card.defaultAccountId ?? '',
        color: card.color ?? undefined,
      })
    } else {
      reset({ closingDay: 1, dueDay: 10, defaultAccountId: '' })
    }
  }, [open, card, reset])

  async function onSubmit(data: FormData) {
    try {
      if (card) {
        await update.mutateAsync({
          id: card.id,
          ...data,
          limit: normalizeReaisForApi(data.limit),
        })
        toast('Cartão atualizado!', 'success')
      } else {
        await create.mutateAsync({ ...data, limit: normalizeReaisForApi(data.limit) })
        toast('Cartão criado!', 'success')
      }
      reset()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar cartão', 'error')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md" preventClose={isSubmitting}>
      <DialogHeader title={card ? 'Editar Cartão' : 'Novo Cartão'} onClose={onClose} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input placeholder="Ex: Nubank, Itaú Platinum..." error={errors.name?.message} {...register('name')} />
          </div>
          <div className="space-y-1.5">
            <Label>Limite</Label>
            <Controller
              name="limit"
              control={control}
              render={({ field }) => (
                <MoneyBrlInput
                  placeholder="5.000,00"
                  error={errors.limit?.message}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  aria-describedby="card-limit-hint"
                />
              )}
            />
            <p id="card-limit-hint" className="sr-only">
              Valor em reais (BRL), duas casas decimais.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Dia de Fechamento</Label>
              <Input type="number" min="1" max="31" error={errors.closingDay?.message} {...register('closingDay')} />
            </div>
            <div className="space-y-1.5">
              <Label>Dia de Vencimento</Label>
              <Input type="number" min="1" max="31" error={errors.dueDay?.message} {...register('dueDay')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-form-default-account">Conta padrão (lançamentos na fatura)</Label>
            <Select
              id="card-form-default-account"
              error={errors.defaultAccountId?.message}
              {...register('defaultAccountId')}
            >
              <option value="">Selecione uma conta</option>
              {selectableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Usada para ancorar compras no cartão; você pode pagar a fatura de outra conta.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Input type="color" className="h-10 px-1 py-1" {...register('color')} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSubmitting}>{card ? 'Salvar' : 'Criar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
