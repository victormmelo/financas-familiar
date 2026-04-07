'use client'

import { useState, useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, CreditCard } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { MoneyBrlInput } from '@/components/forms/money-brl-input'
import { Skeleton } from '@/components/ui/skeleton'
import { CreditCardForm } from '@/components/forms/credit-card-form'
import {
  useCreditCards,
  useCreditCardInvoices,
  useDeleteCreditCard,
  usePayInvoice,
  type CreditCard as CreditCardType,
  type CreditCardInvoice,
} from '@/hooks/use-credit-cards'
import { useAccounts } from '@/hooks/use-accounts'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, getMonthName } from '@/lib/utils'
import { formatBrlMoneyInputFromReais, normalizeReaisForApi } from '@financas/shared-types'

export default function CartoesPage() {
  const { data: cards, isLoading } = useCreditCards()
  const deleteCard = useDeleteCreditCard()
  const { toast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCardType | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteCard.mutateAsync(deleteId)
      toast('Cartão excluído', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao excluir', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Novo Cartão
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-12 w-20 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : cards?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-full bg-muted p-4">
              <CreditCard className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Nenhum cartão cadastrado</p>
              <p className="text-sm text-muted-foreground">Adicione um cartão para controlar suas faturas</p>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Adicionar cartão
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {cards?.map((card) => (
            <Card key={card.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-12 w-20 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow"
                      style={{ backgroundColor: card.color ?? '#6366f1' }}
                    >
                      {card.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{card.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Fecha dia {card.closingDay} · Vence dia {card.dueDay}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Limite</p>
                    <p className="font-mono font-semibold tabular-nums text-foreground">{formatCurrency(card.limit)}</p>
                    {card.currentSpending !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Usado: <span className="font-mono tabular-nums">{formatCurrency(card.currentSpending)}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <button
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditingCard(card); setShowForm(true) }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-rose-600"
                      onClick={() => setDeleteId(card.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground"
                      onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
                    >
                      {expandedCard === card.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Limit bar */}
                {card.currentSpending !== undefined && (
                  <div className="mt-4">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all"
                        style={{ width: `${Math.min((card.currentSpending / card.limit) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-mono tabular-nums">{formatCurrency(card.limit - (card.currentSpending ?? 0))}</span> disponível
                    </p>
                  </div>
                )}

                {/* Invoices */}
                {expandedCard === card.id && <InvoiceList cardId={card.id} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreditCardForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingCard(undefined) }}
        card={editingCard}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Cartão"
        description="Todas as faturas deste cartão serão removidas. Deseja continuar?"
        isLoading={deleteCard.isPending}
      />
    </div>
  )
}

const payInvoiceFormSchema = z.object({
  accountId: z.string().min(1, 'Selecione a conta'),
  amount: z.number().positive().optional(),
})

type PayInvoiceFormData = z.infer<typeof payInvoiceFormSchema>

function InvoiceList({ cardId }: { cardId: string }) {
  const { data, isLoading } = useCreditCardInvoices(cardId)
  const payInvoice = usePayInvoice()
  const { data: accounts } = useAccounts()
  const { toast } = useToast()

  const [payDialog, setPayDialog] = useState<CreditCardInvoice | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PayInvoiceFormData>({
    resolver: zodResolver(payInvoiceFormSchema),
    defaultValues: { accountId: '', amount: undefined },
  })

  useEffect(() => {
    if (payDialog) {
      reset({ accountId: '', amount: undefined })
    }
  }, [payDialog, reset])

  async function onPayConfirm(data: PayInvoiceFormData) {
    if (!payDialog) return
    try {
      await payInvoice.mutateAsync({
        cardId,
        invoiceId: payDialog.id,
        accountId: data.accountId,
        amount: data.amount !== undefined ? normalizeReaisForApi(data.amount) : undefined,
      })
      toast('Fatura paga!', 'success')
      setPayDialog(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao pagar fatura', 'error')
    }
  }

  if (isLoading) return (
    <div className="mt-4 border-t border-border pt-4 space-y-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )

  const invoices = data?.data ?? []

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-medium text-foreground mb-3">Faturas</p>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma fatura encontrada</p>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {getMonthName(inv.referenceMonth)} / {inv.referenceYear}
                </p>
                <p className="text-xs font-mono tabular-nums text-muted-foreground">{formatCurrency(inv.totalAmount)}</p>
              </div>
              <div className="flex items-center gap-2">
                <InvoiceStatusBadge status={inv.status} />
                {inv.status !== 'PAID' && (
                  <Button size="sm" variant="outline" onClick={() => setPayDialog(inv)}>
                    Pagar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!payDialog}
        onClose={() => setPayDialog(null)}
        className="max-w-sm"
        preventClose={payInvoice.isPending}
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onPayConfirm)}>
          <DialogHeader title="Pagar Fatura" onClose={() => setPayDialog(null)} />
          <DialogBody className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Total da fatura:{' '}
              <strong className="font-mono tabular-nums text-foreground">
                {formatCurrency(payDialog?.totalAmount ?? 0)}
              </strong>
            </p>
            <div className="space-y-1.5">
              <Label>Conta para débito</Label>
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
              <Label>Valor</Label>
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <MoneyBrlInput
                    placeholder={
                      payDialog ? formatBrlMoneyInputFromReais(payDialog.totalAmount) : '0,00'
                    }
                    error={errors.amount?.message}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    aria-describedby="pay-invoice-amount-hint"
                  />
                )}
              />
              <p id="pay-invoice-amount-hint" className="text-xs text-muted-foreground">
                Deixe em branco para pagar o total da fatura.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPayDialog(null)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={payInvoice.isPending || isSubmitting}>
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  )
}

function InvoiceStatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return <Badge variant="success">Paga</Badge>
  if (status === 'CLOSED') return <Badge variant="warning">Fechada</Badge>
  return <Badge variant="default">Aberta</Badge>
}
