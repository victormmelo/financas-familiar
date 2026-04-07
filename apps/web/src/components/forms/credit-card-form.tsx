'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useCreateCreditCard, useUpdateCreditCard, type CreditCard } from '@/hooks/use-credit-cards'
import { useToast } from '@/components/ui/toast'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  limit: z.coerce.number().positive('Limite obrigatório'),
  closingDay: z.coerce.number().int().min(1).max(31),
  dueDay: z.coerce.number().int().min(1).max(31),
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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: card
      ? { name: card.name, limit: card.limit, closingDay: card.closingDay, dueDay: card.dueDay, color: card.color }
      : { closingDay: 1, dueDay: 10 },
  })

  async function onSubmit(data: FormData) {
    try {
      if (card) {
        await update.mutateAsync({ id: card.id, ...data })
        toast('Cartão atualizado!', 'success')
      } else {
        await create.mutateAsync(data)
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
            <Label>Limite (R$)</Label>
            <Input type="number" step="0.01" placeholder="5000,00" error={errors.limit?.message} {...register('limit')} />
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
