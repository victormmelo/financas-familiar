'use client'

import { useState, useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, CreditCard, Power, ChevronRight, X } from 'lucide-react'
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
  useUpdateCreditCard,
  usePayInvoice,
  useCreditCardInvoiceStatement,
  useCreateInvoiceSettlement,
  type CreditCard as CreditCardType,
  type CreditCardInvoice,
  type CreditCardInvoiceStatement,
  type InvoiceTransaction,
} from '@/hooks/use-credit-cards'
import { useAccounts } from '@/hooks/use-accounts'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatCalendarDate, formatDate, getMonthName } from '@/lib/utils'
import { formatBrlMoneyInputFromReais, normalizeReaisForApi } from '@financas/shared-types'

export default function CartoesPage() {
  const { data: cards, isLoading } = useCreditCards()
  const deleteCard = useDeleteCreditCard()
  const updateCard = useUpdateCreditCard()
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

  async function toggleActive(card: CreditCardType) {
    try {
      await updateCard.mutateAsync({ id: card.id, isActive: !card.isActive })
      toast(card.isActive ? 'Cartão desativado' : 'Cartão ativado', 'success')
    } catch {
      toast('Erro ao atualizar cartão', 'error')
    }
  }

  const active = cards?.filter((c) => c.isActive) ?? []
  const inactive = cards?.filter((c) => !c.isActive) ?? []

  function renderCard(card: CreditCardType) {
    return (
      <Card key={card.id} className={card.isActive ? '' : 'opacity-60'}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="h-12 w-20 rounded-sm flex items-center justify-center text-white font-bold text-sm shadow"
                style={{ backgroundColor: card.color ?? '#556B2F' }}
              >
                {card.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{card.name}</p>
                  {!card.isActive && (
                    <Badge className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[#2A1212] text-[#F08D8D] border border-[#7A2A2A]">
                      Inativo
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fecha dia {card.closingDay} · Vence dia {card.dueDay}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Limite</p>
              <p className="font-mono font-semibold tabular-nums text-foreground">{formatCurrency(card.limit)}</p>
              {card.currentSpending !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Usado: <span className="font-mono tabular-nums text-[#F08D8D]">{formatCurrency(card.currentSpending)}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 ml-4">
              <button
                className="p-1.5 rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground"
                onClick={() => { setEditingCard(card); setShowForm(true) }}
                title="Editar"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                className="p-1.5 rounded-sm hover:bg-accent text-muted-foreground hover:text-amber-600"
                onClick={() => toggleActive(card)}
                title={card.isActive ? 'Desativar' : 'Ativar'}
              >
                <Power className="h-4 w-4" />
              </button>
              <button
                className="p-1.5 rounded-sm hover:bg-accent text-muted-foreground hover:text-[#F08D8D]"
                onClick={() => setDeleteId(card.id)}
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                className="p-1.5 rounded-sm hover:bg-accent text-muted-foreground"
                onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
                title="Ver faturas"
              >
                {expandedCard === card.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Barra de uso do limite */}
          {card.isActive && card.currentSpending !== undefined && (
            <div className="mt-4">
              <div className="h-1.5 rounded-sm bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-sm transition-all ${
                    card.currentSpending / card.limit > 0.9
                      ? 'bg-[#F08D8D]'
                      : card.currentSpending / card.limit > 0.7
                      ? 'bg-[#E3CB67]'
                      : 'bg-[#7CFC98]'
                  }`}
                  style={{ width: `${Math.min((card.currentSpending / card.limit) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-mono tabular-nums text-[#8DDBA4]">{formatCurrency(card.limit - (card.currentSpending ?? 0))}</span> disponível
              </p>
            </div>
          )}

          {/* Faturas */}
          {expandedCard === card.id && (
            <InvoiceList cardId={card.id} defaultAccountId={card.defaultAccountId} />
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cartões de Crédito</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Gestão de faturas e limites</p>
        </div>
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
                    <Skeleton className="h-12 w-20 rounded-sm" />
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
            <div className="rounded-sm bg-muted p-4 border border-border">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Nenhum cartão cadastrado</p>
              <p className="text-xs text-muted-foreground mt-1">Adicione um cartão para controlar suas faturas</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Adicionar cartão
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {active.length > 0 && (
            <div className="flex flex-col gap-4">
              {active.map(renderCard)}
            </div>
          )}
          {inactive.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Cartões Inativos
              </h3>
              {inactive.map(renderCard)}
            </div>
          )}
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

// ─── InvoiceList ──────────────────────────────────────────────────────────────

const payInvoiceFormSchema = z.object({
  accountId: z.string().min(1, 'Selecione a conta'),
  amount: z.number().positive().optional(),
})

type PayInvoiceFormData = z.infer<typeof payInvoiceFormSchema>

const settlementFormSchema = z.object({
  accountId: z.string().min(1, 'Selecione a conta'),
  downPayment: z.number().min(0).optional(),
  installmentCount: z.number().int().min(1),
  installmentAmount: z.number().positive(),
  firstInstallmentMonth: z.number().int().min(1).max(12),
  firstInstallmentYear: z.number().int().min(2000).max(2200),
})

type SettlementFormData = z.infer<typeof settlementFormSchema>

function InvoiceList({ cardId, defaultAccountId }: { cardId: string; defaultAccountId?: string | null }) {
  const { data, isLoading } = useCreditCardInvoices(cardId)
  const payInvoice = usePayInvoice()
  const createSettlement = useCreateInvoiceSettlement()
  const { data: accounts } = useAccounts()
  const { toast } = useToast()

  const [payDialog, setPayDialog] = useState<CreditCardInvoice | null>(null)
  const [settlementDialog, setSettlementDialog] = useState<CreditCardInvoice | null>(null)
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null)

  const payStatementQuery = useCreditCardInvoiceStatement(cardId, payDialog?.id ?? '')

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

  const {
    register: registerSettlement,
    control: controlSettlement,
    handleSubmit: handleSubmitSettlement,
    reset: resetSettlement,
    formState: { errors: settlementErrors, isSubmitting: isSettlementSubmitting },
  } = useForm<SettlementFormData>({
    resolver: zodResolver(settlementFormSchema),
    defaultValues: {
      accountId: '',
      downPayment: undefined,
      installmentCount: 3,
      installmentAmount: undefined,
      firstInstallmentMonth: new Date().getMonth() + 1,
      firstInstallmentYear: new Date().getFullYear(),
    },
  })

  useEffect(() => {
    if (payDialog) {
      reset({
        accountId: defaultAccountId ?? '',
        amount: undefined,
      })
    }
  }, [payDialog, reset, defaultAccountId])

  useEffect(() => {
    if (settlementDialog) {
      const now = new Date()
      resetSettlement({
        accountId: defaultAccountId ?? '',
        downPayment: undefined,
        installmentCount: 3,
        installmentAmount: undefined,
        firstInstallmentMonth: now.getMonth() + 1,
        firstInstallmentYear: now.getFullYear(),
      })
    }
  }, [settlementDialog, defaultAccountId, resetSettlement])

  async function onPayConfirm(data: PayInvoiceFormData) {
    if (!payDialog) return
    try {
      await payInvoice.mutateAsync({
        cardId,
        invoiceId: payDialog.id,
        accountId: data.accountId,
        amount: data.amount !== undefined ? normalizeReaisForApi(data.amount) : undefined,
      })
      toast('Pagamento registrado', 'success')
      setPayDialog(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao pagar fatura', 'error')
    }
  }

  async function onSettlementConfirm(data: SettlementFormData) {
    if (!settlementDialog) return
    try {
      await createSettlement.mutateAsync({
        cardId,
        invoiceId: settlementDialog.id,
        accountId: data.accountId,
        downPayment: data.downPayment !== undefined ? normalizeReaisForApi(data.downPayment) : undefined,
        installmentCount: data.installmentCount,
        installmentAmount: normalizeReaisForApi(data.installmentAmount),
        firstInstallmentMonth: data.firstInstallmentMonth,
        firstInstallmentYear: data.firstInstallmentYear,
      })
      toast('Negociação criada com sucesso', 'success')
      setSettlementDialog(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao negociar fatura', 'error')
    }
  }

  if (isLoading) return (
    <div className="mt-4 border-t border-border pt-4 space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-sm" />
      ))}
    </div>
  )

  const invoices = data?.data ?? []

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Faturas</p>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma fatura encontrada</p>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between py-3 px-3 rounded-sm bg-muted/50 border border-border hover:bg-accent/30 transition-colors cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => setDetailInvoiceId(inv.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setDetailInvoiceId(inv.id)
                }
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {getMonthName(inv.referenceMonth)} / {inv.referenceYear}
                  </p>
                  <InvoiceStatusBadge status={inv.status} />
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-xs font-mono tabular-nums text-[#F08D8D]">{formatCurrency(inv.totalAmount)}</p>
                  {inv.dueDate && inv.status !== 'PAID' && (
                    <p className="text-[10px] text-muted-foreground">
                      Venc. <span className={isOverdue(inv.dueDate) ? 'text-[#F08D8D] font-medium' : ''}>
                        {formatCalendarDate(inv.dueDate)}
                      </span>
                    </p>
                  )}
                  {inv.status === 'PAID' && inv.paidAt && (
                    <p className="text-[10px] text-[#8DDBA4]">Pago em {formatDate(inv.paidAt)}</p>
                  )}
                  {typeof inv.outstandingAmount === 'number' && inv.status !== 'PAID' && inv.status !== 'RENEGOTIATED' && (
                    <p className="text-[10px] text-muted-foreground">
                      Em aberto: <span className="font-mono tabular-nums">{formatCurrency(inv.outstandingAmount)}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-3">
                <button
                  className="p-1.5 rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDetailInvoiceId(inv.id)
                  }}
                  title="Ver lançamentos"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {inv.status !== 'PAID' && inv.status !== 'RENEGOTIATED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPayDialog(inv)
                    }}
                  >
                    Pagar
                  </Button>
                )}
                {inv.status !== 'PAID' && inv.status !== 'RENEGOTIATED' && (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSettlementDialog(inv)
                    }}
                  >
                    Negociar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog de detalhe da fatura */}
      {detailInvoiceId && (
        <InvoiceDetailDialog
          cardId={cardId}
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
        />
      )}

      {/* Dialog de pagamento */}
      <Dialog
        open={!!payDialog}
        onClose={() => setPayDialog(null)}
        className="max-w-sm"
        preventClose={payInvoice.isPending}
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onPayConfirm)}>
          <DialogHeader title="Pagar Fatura" onClose={() => setPayDialog(null)} />
          <DialogBody className="space-y-4">
            {payDialog && (
              <div className="rounded-sm border border-border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Fatura</p>
                <p className="text-sm font-medium text-foreground">
                  {getMonthName(payDialog.referenceMonth)} / {payDialog.referenceYear}
                </p>
                <p className="font-mono tabular-nums text-[#F08D8D] text-lg font-semibold">
                  {formatCurrency(payStatementQuery.data?.breakdown.totalAmount ?? payDialog.totalAmount)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Em aberto:{' '}
                  <span className="font-mono tabular-nums">
                    {formatCurrency(payStatementQuery.data?.breakdown.outstandingAmount ?? payDialog.outstandingAmount ?? payDialog.totalAmount)}
                  </span>
                </p>
                {payDialog.dueDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Vencimento: <span className={isOverdue(payDialog.dueDate) ? 'text-[#F08D8D]' : ''}>{formatCalendarDate(payDialog.dueDate)}</span>
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Conta para débito</Label>
              <Select error={errors.accountId?.message} {...register('accountId')}>
                <option value="">Selecione uma conta</option>
                {accounts?.filter((a) => a.isActive).map((a) => (
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
                      payDialog
                        ? formatBrlMoneyInputFromReais(
                            payStatementQuery.data?.breakdown.outstandingAmount ?? payDialog.outstandingAmount ?? payDialog.totalAmount,
                          )
                        : '0,00'
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

      {/* Dialog de negociação */}
      <Dialog
        open={!!settlementDialog}
        onClose={() => setSettlementDialog(null)}
        className="max-w-sm"
        preventClose={createSettlement.isPending}
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmitSettlement(onSettlementConfirm)}>
          <DialogHeader title="Negociar Fatura" onClose={() => setSettlementDialog(null)} />
          <DialogBody className="space-y-4">
            {settlementDialog && (
              <div className="rounded-sm border border-border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Saldo atual</p>
                <p className="font-mono tabular-nums text-lg font-semibold text-[#F08D8D]">
                  {formatCurrency(settlementDialog.outstandingAmount ?? settlementDialog.totalAmount)}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Conta para débito da entrada</Label>
              <Select error={settlementErrors.accountId?.message} {...registerSettlement('accountId')}>
                <option value="">Selecione uma conta</option>
                {accounts?.filter((a) => a.isActive).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Entrada (opcional)</Label>
              <Controller
                name="downPayment"
                control={controlSettlement}
                render={({ field }) => (
                  <MoneyBrlInput
                    placeholder="0,00"
                    error={settlementErrors.downPayment?.message}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Qtd. parcelas</Label>
                <Select error={settlementErrors.installmentCount?.message} {...registerSettlement('installmentCount', { valueAsNumber: true })}>
                  {Array.from({ length: 24 }).map((_, i) => {
                    const value = i + 1
                    return <option key={value} value={value}>{value}x</option>
                  })}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor parcela</Label>
                <Controller
                  name="installmentAmount"
                  control={controlSettlement}
                  render={({ field }) => (
                    <MoneyBrlInput
                      placeholder="0,00"
                      error={settlementErrors.installmentAmount?.message}
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  )}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>1ª parcela mês</Label>
                <Select error={settlementErrors.firstInstallmentMonth?.message} {...registerSettlement('firstInstallmentMonth', { valueAsNumber: true })}>
                  {Array.from({ length: 12 }).map((_, i) => {
                    const value = i + 1
                    return <option key={value} value={value}>{getMonthName(value)}</option>
                  })}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>1ª parcela ano</Label>
                <Select error={settlementErrors.firstInstallmentYear?.message} {...registerSettlement('firstInstallmentYear', { valueAsNumber: true })}>
                  {Array.from({ length: 8 }).map((_, i) => {
                    const value = new Date().getFullYear() + i
                    return <option key={value} value={value}>{value}</option>
                  })}
                </Select>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSettlementDialog(null)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={createSettlement.isPending || isSettlementSubmitting}>
              Confirmar negociação
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  )
}

// ─── InvoiceDetailDialog ──────────────────────────────────────────────────────

function InvoiceDetailDialog({
  cardId,
  invoiceId,
  onClose,
}: {
  cardId: string
  invoiceId: string
  onClose: () => void
}) {
  const { data: statement, isLoading } = useCreditCardInvoiceStatement(cardId, invoiceId)
  const invoice = statement?.invoice

  return (
    <Dialog open onClose={onClose} className="max-w-lg">
      <DialogHeader
        title={
          invoice
            ? `Fatura ${getMonthName(invoice.referenceMonth)} / ${invoice.referenceYear}`
            : 'Detalhes da fatura'
        }
        onClose={onClose}
      />
      <DialogBody className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-sm" />
            ))}
          </div>
        ) : invoice ? (
          <>
            {/* Cabeçalho da fatura */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-sm border border-border bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total fatura</p>
                <p className="font-mono tabular-nums font-semibold text-[#F08D8D]">
                  {formatCurrency(statement?.breakdown.totalAmount ?? invoice.totalAmount)}
                </p>
              </div>
              <div className="rounded-sm border border-border bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</p>
                <div className="mt-0.5"><InvoiceStatusBadge status={invoice.status} /></div>
              </div>
              <div className="rounded-sm border border-border bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saldo em aberto</p>
                <p className={`text-xs font-medium tabular-nums ${isOverdue(invoice.dueDate) && invoice.status !== 'PAID' ? 'text-[#F08D8D]' : 'text-foreground'}`}>
                  {formatCurrency(statement?.breakdown.outstandingAmount ?? invoice.outstandingAmount ?? 0)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <BreakdownCard label="Total do ciclo" value={statement?.breakdown.cycleAmount ?? 0} />
              <BreakdownCard label="Saldo carregado" value={statement?.breakdown.carriedAmount ?? 0} />
              <BreakdownCard label="Parcelas negociadas" value={statement?.breakdown.negotiatedInstallmentAmount ?? 0} />
              <BreakdownCard label="Pagamentos" value={statement?.breakdown.paymentAmount ?? 0} />
            </div>

            {statement?.settlement && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Plano da negociação
                </p>
                <div className="space-y-1">
                  {statement.settlement.installments.map((inst) => (
                    <div key={inst.id} className="flex items-center justify-between rounded-sm border border-border bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        Parcela {inst.sequence} · {String(inst.dueReferenceMonth).padStart(2, '0')}/{inst.dueReferenceYear}
                      </p>
                      <p className="font-mono tabular-nums text-sm text-foreground">
                        {formatCurrency(inst.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de lançamentos */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Lançamentos ({invoice.transactions?.length ?? 0})
              </p>
              {!invoice.transactions || invoice.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum lançamento nesta fatura</p>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {invoice.transactions.map((t: InvoiceTransaction) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between py-2 px-3 rounded-sm border border-border bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{t.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] font-mono text-muted-foreground">{formatCalendarDate(t.date)}</p>
                          {t.category && (
                            <span className="text-[10px] text-muted-foreground">{t.category.name}</span>
                          )}
                          {t.status === 'DRAFT' && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#2B240D] text-[#E3CB67] border border-[#7A6416] rounded-sm px-1 py-0.5">
                              Rascunho
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="font-mono tabular-nums text-sm text-[#F08D8D] ml-3">
                        {formatCurrency(typeof t.amount === 'number' ? t.amount : Number(t.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Fatura não encontrada</p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Fechar</Button>
      </DialogFooter>
    </Dialog>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date()
}

function InvoiceStatusBadge({ status }: { status: string }) {
  if (status === 'PAID')
    return (
      <span className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-[#112417] text-[#8DDBA4] border-[#285E38]">
        Paga
      </span>
    )
  if (status === 'CLOSED')
    return (
      <span className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-[#2B240D] text-[#E3CB67] border-[#7A6416]">
        Fechada
      </span>
    )
  if (status === 'PARTIAL')
    return (
      <span className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-[#1E2230] text-[#9FB3FF] border-[#47598F]">
        Parcial
      </span>
    )
  if (status === 'OVERDUE')
    return (
      <span className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-[#2A1212] text-[#F08D8D] border-[#7A2A2A]">
        Atrasada
      </span>
    )
  if (status === 'RENEGOTIATED')
    return (
      <span className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-[#1A1430] text-[#C6A7FF] border-[#5B4596]">
        Renegociada
      </span>
    )
  return (
    <span className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-[#10202A] text-[#86C3E6] border-[#28546A]">
      Aberta
    </span>
  )
}

function BreakdownCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-muted/50 p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-mono tabular-nums text-sm text-foreground">{formatCurrency(value)}</p>
    </div>
  )
}
