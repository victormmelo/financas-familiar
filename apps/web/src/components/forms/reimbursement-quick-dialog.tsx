'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useAccounts } from '@/hooks/use-accounts'
import {
  useCreateTransaction,
  useReimbursementContext,
  useUpdateTransaction,
  type Transaction,
} from '@/hooks/use-transactions'
import { useToast } from '@/components/ui/toast'
import { MoneyBrlInput } from '@/components/forms/money-brl-input'
import { formatDateInput } from '@/lib/utils'
import { normalizeReaisForApi } from '@financas/shared-types'

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const schema = z.object({
  accountId: z.string().min(1, 'Selecione uma conta'),
  amount: z
    .number({ invalid_type_error: 'Informe o valor' })
    .positive('Valor deve ser positivo'),
  description: z.string().min(1, 'Descrição obrigatória'),
  notes: z.string().optional(),
  date: z.string().min(1, 'Data obrigatória'),
  reimbursementOverflowReason: z.string().optional(),
})

type FormData = z.infer<typeof schema>

/** API exige ≥5 caracteres quando a justificativa é enviada */
function reimbursementOverflowPayload(raw: string | undefined): string | undefined {
  const t = raw?.trim()
  if (!t || t.length < 5) return undefined
  return t
}

export type ReimbursementQuickDialogProps = {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  /** Modo criar: transação original confirmada e não reembolso */
  original?: Transaction
  /** Modo editar: linha do reembolso */
  reimbursement?: Transaction
}

export function ReimbursementQuickDialog({
  open,
  onClose,
  mode,
  original,
  reimbursement,
}: ReimbursementQuickDialogProps) {
  const { data: accounts } = useAccounts()
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const { toast } = useToast()

  const originalIdForContext =
    mode === 'create' ? original?.id : reimbursement?.linkedTransactionId ?? undefined

  const { data: reimbursementContext, isLoading: contextLoading } = useReimbursementContext(
    originalIdForContext,
    open && !!originalIdForContext,
  )

  const selectableAccounts = useMemo(() => {
    if (!accounts) return []
    if (mode === 'edit' && reimbursement) {
      return accounts.filter((a) => a.isActive || a.id === reimbursement.accountId)
    }
    return accounts.filter((a) => a.isActive)
  }, [accounts, mode, reimbursement])

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      accountId: '',
      amount: 0,
      description: '',
      notes: '',
      date: formatDateInput(new Date()),
      reimbursementOverflowReason: '',
    },
  })

  const appliedContextOriginalId = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && reimbursement) {
      reset({
        accountId: reimbursement.accountId,
        amount: reimbursement.amount,
        description: reimbursement.description,
        notes: reimbursement.notes ?? '',
        date: reimbursement.date,
        reimbursementOverflowReason: '',
      })
      return
    }
    if (mode === 'create') {
      appliedContextOriginalId.current = null
      reset({
        accountId: '',
        amount: 0,
        description: '',
        notes: '',
        date: formatDateInput(new Date()),
        reimbursementOverflowReason: '',
      })
    }
  }, [open, mode, reimbursement, reset])

  useEffect(() => {
    if (!open) {
      appliedContextOriginalId.current = null
      return
    }
    if (mode !== 'create' || !reimbursementContext?.transaction || !original) return
    const oid = reimbursementContext.transaction.id
    if (appliedContextOriginalId.current === oid) return
    appliedContextOriginalId.current = oid
    const tx = reimbursementContext.transaction
    const remaining = tx.remainingReimbursableAmount ?? 0
    const defaultAmount = remaining > 0 ? remaining : tx.amount
    reset({
      accountId: getValues('accountId'),
      amount: defaultAmount,
      description: `Reembolso: ${tx.description}`,
      notes: '',
      date: formatDateInput(new Date()),
      reimbursementOverflowReason: '',
    })
  }, [open, mode, reimbursementContext?.transaction?.id, original?.id, reset, getValues])

  async function onSubmit(data: FormData) {
    try {
      if (mode === 'create') {
        if (!original || !reimbursementContext?.suggested.type) {
          toast('Carregue o contexto do reembolso antes de salvar.', 'error')
          return
        }
        await create.mutateAsync({
          accountId: data.accountId,
          type: reimbursementContext.suggested.type,
          nature: 'REIMBURSEMENT',
          linkedTransactionId: original.id,
          amount: normalizeReaisForApi(data.amount),
          description: data.description,
          notes: data.notes || undefined,
          date: data.date,
          source: 'MANUAL',
          confirmed: true,
          liquidated: true,
          reimbursementOverflowReason: reimbursementOverflowPayload(data.reimbursementOverflowReason),
        })
        toast('Reembolso registrado!', 'success')
      } else {
        if (!reimbursement?.linkedTransactionId) {
          toast('Reembolso sem vínculo com a transação original.', 'error')
          return
        }
        await update.mutateAsync({
          id: reimbursement.id,
          amount: normalizeReaisForApi(data.amount),
          description: data.description,
          notes: data.notes || null,
          date: data.date,
          accountId: data.accountId,
          reimbursementOverflowReason: reimbursementOverflowPayload(data.reimbursementOverflowReason),
        })
        toast('Reembolso atualizado!', 'success')
      }
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar', 'error')
    }
  }

  const ctxTx = reimbursementContext?.transaction
  const title = mode === 'create' ? 'Registrar reembolso' : 'Editar reembolso'
  const disableSubmit =
    isSubmitting || (mode === 'create' && (contextLoading || !reimbursementContext || !original))

  return (
    <Dialog open={open} onClose={onClose} className="w-full max-w-md" preventClose={isSubmitting}>
      <DialogHeader title={title} onClose={onClose} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <DialogBody className="space-y-4">
          {mode === 'create' && contextLoading && (
            <p className="text-xs text-muted-foreground">Carregando contexto…</p>
          )}

          {mode === 'create' && ctxTx && (
            <div className="rounded-sm border border-[#28546A] bg-[#10202A] p-3 space-y-2">
              <p className="text-xs font-medium text-[#86C3E6] uppercase tracking-wide">Transação original</p>
              <p className="text-xs text-muted-foreground">
                Valor:{' '}
                <span className="font-mono text-foreground">{BRL_FORMATTER.format(ctxTx.amount)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Já reembolsado:{' '}
                <span className="font-mono text-foreground">{BRL_FORMATTER.format(ctxTx.reimbursedAmount ?? 0)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Saldo reembolsável:{' '}
                <span className="font-mono text-[#8DDBA4]">
                  {BRL_FORMATTER.format(ctxTx.remainingReimbursableAmount ?? 0)}
                </span>
              </p>
            </div>
          )}

          {mode === 'edit' && reimbursement?.linkedTransaction && (
            <p className="text-xs text-muted-foreground">
              Original:{' '}
              <span className="text-foreground font-medium">{reimbursement.linkedTransaction.description}</span>
            </p>
          )}

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="rb-account">Conta</Label>
            <Select id="rb-account" error={errors.accountId?.message} {...register('accountId')}>
              <option value="">Selecione uma conta</option>
              {selectableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="rb-amount">Valor</Label>
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <MoneyBrlInput
                    id="rb-amount"
                    placeholder="0,00"
                    error={errors.amount?.message}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                )}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="rb-date">Data</Label>
              <Input
                id="rb-date"
                type="date"
                className="rounded-sm font-mono tabular-nums"
                error={errors.date?.message}
                {...register('date')}
              />
            </div>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="rb-description">Descrição</Label>
            <Input
              id="rb-description"
              placeholder="Descrição do reembolso"
              error={errors.description?.message}
              {...register('description')}
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="rb-notes">Observações</Label>
            <Input id="rb-notes" placeholder="Opcional" {...register('notes')} />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="rb-overflow">Justificativa se extrapolar o valor original (opcional)</Label>
            <Input
              id="rb-overflow"
              placeholder="Obrigatória apenas se a soma dos reembolsos ultrapassar o valor da despesa/receita original."
              {...register('reimbursementOverflowReason')}
            />
            <p className="text-[10px] text-muted-foreground">
              Só é usada quando o servidor permite extrapolação configurada no ambiente.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="w-full sm:w-auto" isLoading={isSubmitting} disabled={disableSubmit}>
              {mode === 'create' ? 'Registrar' : 'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
