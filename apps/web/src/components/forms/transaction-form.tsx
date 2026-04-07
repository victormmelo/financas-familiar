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
import { useCategories } from '@/hooks/use-categories'
import { useCreateTransaction, useUpdateTransaction, type Transaction } from '@/hooks/use-transactions'
import { useToast } from '@/components/ui/toast'
import { MoneyBrlInput } from '@/components/forms/money-brl-input'
import { formatDateInput } from '@/lib/utils'
import { normalizeReaisForApi } from '@financas/shared-types'

// ─── RRULE builder helpers ────────────────────────────────────────────────────

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

const FREQ_LABELS: Record<Frequency, string> = {
  DAILY: 'Diário',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
}

/** Constrói uma string RRULE compatível com RFC 5545 sem depender da lib rrule no frontend. */
function buildRRule(frequency: Frequency, startDate: string): string {
  // Formata DTSTART como YYYYMMDDTHHMMSSZ
  const d = new Date(startDate + 'T00:00:00Z')
  const pad = (n: number) => String(n).padStart(2, '0')
  const dtstart = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T000000Z`
  return `DTSTART:${dtstart}\nRRULE:FREQ=${frequency}`
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  accountId: z.string().min(1, 'Selecione uma conta'),
  categoryId: z.string().optional(),
  creditCardId: z.string().optional(),
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z
    .number({ invalid_type_error: 'Informe o valor' })
    .positive('Valor deve ser positivo'),
  description: z.string().min(1, 'Descrição obrigatória'),
  notes: z.string().optional(),
  date: z.string().min(1, 'Data obrigatória'),
  // Modo de lançamento: 'simple' | 'recurring' | 'installment'
  mode: z.enum(['simple', 'recurring', 'installment']).default('simple'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).default('MONTHLY'),
  installmentCount: z.coerce
    .number()
    .int()
    .min(2, 'Mínimo 2 parcelas')
    .max(360, 'Máximo 360 parcelas')
    .optional(),
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
    control,
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
          mode: 'simple',
          frequency: 'MONTHLY',
        }
      : {
          type: 'EXPENSE',
          date: formatDateInput(new Date()),
          mode: 'simple',
          frequency: 'MONTHLY',
        },
  })

  const selectedType = watch('type')
  const selectedMode = watch('mode')

  const filteredCategories = categories?.filter(
    (c) => c.type === selectedType || c.type === 'BOTH',
  )

  async function onSubmit(data: FormData) {
    try {
      if (transaction) {
        await update.mutateAsync({
          id: transaction.id,
          categoryId: data.categoryId || null,
          amount: normalizeReaisForApi(data.amount),
          description: data.description,
          notes: data.notes || null,
          date: data.date,
        })
        toast('Transação atualizada!', 'success')
      } else {
        const base = {
          accountId: data.accountId,
          categoryId: data.categoryId || undefined,
          creditCardId: data.creditCardId || undefined,
          type: data.type,
          amount: normalizeReaisForApi(data.amount),
          description: data.description,
          notes: data.notes || undefined,
          date: data.date,
          source: 'MANUAL' as const,
        }

        if (data.mode === 'recurring') {
          await create.mutateAsync({
            ...base,
            isRecurring: true,
            rrule: buildRRule(data.frequency, data.date),
          })
          toast('Recorrência criada! Rascunhos gerados para os próximos 90 dias.', 'success')
        } else if (data.mode === 'installment') {
          await create.mutateAsync({
            ...base,
            installmentCount: data.installmentCount,
          })
          toast(`${data.installmentCount} parcelas criadas como rascunho!`, 'success')
        } else {
          await create.mutateAsync(base)
          toast('Transação criada!', 'success')
        }
      }
      reset()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar transação', 'error')
    }
  }

  const isEdit = !!transaction

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="w-full max-w-md"
      preventClose={isSubmitting}
    >
      <DialogHeader title={isEdit ? 'Editar Transação' : 'Nova Transação'} onClose={onClose} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">

          {/* Modo de lançamento — somente na criação */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Tipo de lançamento</Label>
              <div className="grid grid-cols-3 gap-1 rounded-sm border border-border p-1 bg-muted">
                {(['simple', 'recurring', 'installment'] as const).map((m) => (
                  <label key={m} className="cursor-pointer">
                    <input type="radio" value={m} {...register('mode')} className="sr-only" />
                    <span
                      className={`block text-center text-xs font-medium py-1.5 rounded-sm transition-colors ${
                        selectedMode === m
                          ? 'bg-background text-[#7CFC98] border border-[#285E38]'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {m === 'simple' ? 'Simples' : m === 'recurring' ? 'Recorrente' : 'Parcelado'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select error={errors.type?.message} {...register('type')}>
                <option value="EXPENSE">Despesa</option>
                <option value="INCOME">Receita</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor{selectedMode === 'installment' ? ' por parcela' : ''}</Label>
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
                    aria-describedby="transaction-amount-hint"
                  />
                )}
              />
              <p id="transaction-amount-hint" className="sr-only">
                Valor em reais (BRL), duas casas decimais.
              </p>
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
            <Label>{selectedMode === 'recurring' ? 'Data inicial' : selectedMode === 'installment' ? 'Data da 1ª parcela' : 'Data'}</Label>
            <Input type="date" error={errors.date?.message} {...register('date')} />
          </div>

          {/* Campos extras: Recorrente */}
          {!isEdit && selectedMode === 'recurring' && (
            <div className="rounded-sm border border-[#285E38] bg-[#112417] p-3 space-y-3">
              <p className="text-xs font-medium text-[#8DDBA4] uppercase tracking-wide">Configuração de recorrência</p>
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Select {...register('frequency')}>
                  {(Object.keys(FREQ_LABELS) as Frequency[]).map((f) => (
                    <option key={f} value={f}>{FREQ_LABELS[f]}</option>
                  ))}
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Rascunhos serão gerados automaticamente para os próximos 90 dias e renovados diariamente.
              </p>
            </div>
          )}

          {/* Campos extras: Parcelado */}
          {!isEdit && selectedMode === 'installment' && (
            <div className="rounded-sm border border-[#28546A] bg-[#10202A] p-3 space-y-3">
              <p className="text-xs font-medium text-[#86C3E6] uppercase tracking-wide">Configuração de parcelamento</p>
              <div className="space-y-1.5">
                <Label>Número de parcelas</Label>
                <Input
                  type="number"
                  min="2"
                  max="360"
                  placeholder="Ex: 12"
                  error={errors.installmentCount?.message}
                  {...register('installmentCount')}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Todas as parcelas serão criadas como rascunho com datas mensais consecutivas.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Input placeholder="Opcional..." {...register('notes')} />
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button variant="outline" type="button" className="w-full sm:w-auto" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="w-full sm:w-auto" isLoading={isSubmitting}>
              {isEdit ? 'Salvar' : selectedMode === 'installment' ? 'Criar parcelas' : selectedMode === 'recurring' ? 'Criar recorrência' : 'Criar'}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
