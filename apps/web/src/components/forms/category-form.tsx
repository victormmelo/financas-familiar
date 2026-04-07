'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useCreateCategory, useUpdateCategory, type Category } from '@/hooks/use-categories'
import { useToast } from '@/components/ui/toast'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: z.enum(['INCOME', 'EXPENSE', 'BOTH']),
  parentId: z.string().optional(),
  color: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  category?: Category
  parentCategories?: Category[]
}

export function CategoryForm({ open, onClose, category, parentCategories }: Props) {
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: category
      ? { name: category.name, type: category.type, parentId: category.parentId, color: category.color }
      : { type: 'EXPENSE' },
  })

  async function onSubmit(data: FormData) {
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, name: data.name, type: data.type, color: data.color })
        toast('Categoria atualizada!', 'success')
      } else {
        await create.mutateAsync({ ...data, parentId: data.parentId || undefined })
        toast('Categoria criada!', 'success')
      }
      reset()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar categoria', 'error')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md" preventClose={isSubmitting}>
      <DialogHeader title={category ? 'Editar Categoria' : 'Nova Categoria'} onClose={onClose} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input placeholder="Ex: Alimentação, Salário..." error={errors.name?.message} {...register('name')} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select error={errors.type?.message} {...register('type')}>
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
              <option value="BOTH">Ambos</option>
            </Select>
          </div>
          {!category && parentCategories && parentCategories.length > 0 && (
            <div className="space-y-1.5">
              <Label>Categoria Pai (opcional)</Label>
              <Select {...register('parentId')}>
                <option value="">Nenhuma</option>
                {parentCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Input type="color" className="h-10 px-1 py-1" {...register('color')} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={isSubmitting}>{category ? 'Salvar' : 'Criar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
