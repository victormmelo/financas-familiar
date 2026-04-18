'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Plus,
  Check,
  CheckCheck,
  CreditCard,
  Trash2,
  Pencil,
  Receipt,
  RotateCcw,
  Tag,
  Banknote,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { TransactionForm } from '@/components/forms/transaction-form'
import {
  useTransactions,
  useConfirmTransaction,
  useBulkConfirmTransactions,
  useBulkSetTransactionCategory,
  useDeleteTransaction,
  useUpdateTransaction,
  type Transaction,
  type TransactionFilters,
} from '@/hooks/use-transactions'
import { useAccounts } from '@/hooks/use-accounts'
import { useCategories } from '@/hooks/use-categories'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { EntryLaunchContextBar } from '@/components/layout/entry-launch-context-bar'

const filterSelectClass =
  'h-10 min-h-10 w-full text-sm md:h-8 md:min-h-0'

function transactionMovementLabel(t: Transaction): string | null {
  if (t.recognition === 'INVOICE_PAYMENT' && t.creditCardInvoice) {
    const inv = t.creditCardInvoice
    const mm = String(inv.referenceMonth).padStart(2, '0')
    const cardName = inv.creditCard?.name ?? 'Cartão'
    return `Pagamento de fatura · ${cardName} · ${mm}/${inv.referenceYear}`
  }
  if (t.recognition === 'TRANSFER_LEG' && t.transfer) {
    if (t.type === 'EXPENSE') {
      return `Transferência (saída) → ${t.transfer.toAccount?.name ?? 'Conta destino'}`
    }
    return `Transferência (entrada) ← ${t.transfer.fromAccount?.name ?? 'Conta origem'}`
  }
  return null
}

function transactionNatureLabel(t: Transaction): string | null {
  if (t.nature === 'REIMBURSEMENT') return 'Reembolso'
  if (t.nature === 'TRANSFER') return 'Transferência'
  if (t.nature === 'ADJUSTMENT') return 'Ajuste'
  if (t.nature === 'REVERSAL') return 'Estorno'
  return null
}

function natureBadgeVariant(
  nature: Transaction['nature'],
): 'secondary' | 'success' | 'info' | 'warning' | 'destructive' {
  if (nature === 'REIMBURSEMENT') return 'info'
  if (nature === 'TRANSFER') return 'secondary'
  if (nature === 'ADJUSTMENT') return 'warning'
  if (nature === 'REVERSAL') return 'destructive'
  return 'success'
}
const filterDateClass =
  'h-10 min-h-10 w-full rounded-sm font-mono text-sm tabular-nums md:h-8 md:min-h-0'

export default function TransacoesPage() {
  const { toast } = useToast()
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1, limit: 20 })
  const [showForm, setShowForm] = useState(false)
  const [createEntry, setCreateEntry] = useState<'default' | 'card'>('default')
  const [editingTx, setEditingTx] = useState<Transaction | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCategoryPanelOpen, setBulkCategoryPanelOpen] = useState(false)
  const [bulkCategoryId, setBulkCategoryId] = useState('')

  const { data, isLoading } = useTransactions(filters)
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const confirm = useConfirmTransaction()
  const bulkConfirm = useBulkConfirmTransactions()
  const bulkSetCategory = useBulkSetTransactionCategory()
  const remove = useDeleteTransaction()
  const liquidate = useUpdateTransaction()

  const transactions = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  const selectedTxs = useMemo(
    () => transactions.filter((t) => selected.has(t.id)),
    [transactions, selected],
  )
  const bulkTypes = useMemo(() => new Set(selectedTxs.map((t) => t.type)), [selectedTxs])
  const canBulkCategorize = selectedTxs.length > 0 && bulkTypes.size === 1
  const bulkType = canBulkCategorize ? selectedTxs[0]!.type : undefined
  const filteredBulkCategories = categories?.filter(
    (c) => bulkType !== undefined && (c.type === bulkType || c.type === 'BOTH'),
  )

  useEffect(() => {
    if (!canBulkCategorize) setBulkCategoryPanelOpen(false)
  }, [canBulkCategorize])

  function setFilter(key: keyof TransactionFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }))
  }

  function clearFilters() {
    setFilters({ page: 1, limit: 20 })
  }

  const activeFilterCount = [
    filters.type,
    filters.status,
    filters.accountId,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length

  const hasPeriodRange = Boolean(filters.startDate && filters.endDate)

  const showMobileBulkBar = selected.size > 0

  function clearBulkSelection() {
    setSelected(new Set())
    setBulkCategoryPanelOpen(false)
    setBulkCategoryId('')
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleConfirm(id: string) {
    try {
      await confirm.mutateAsync(id)
      toast('Transação confirmada!', 'success')
    } catch {
      toast('Erro ao confirmar', 'error')
    }
  }

  async function handleLiquidate(id: string) {
    try {
      await liquidate.mutateAsync({ id, liquidated: true })
      toast('Marcado como liquidado.', 'success')
    } catch {
      toast('Erro ao liquidar', 'error')
    }
  }

  async function handleBulkConfirm() {
    try {
      await bulkConfirm.mutateAsync(Array.from(selected))
      toast(`${selected.size} transações confirmadas!`, 'success')
      clearBulkSelection()
    } catch {
      toast('Erro ao confirmar em lote', 'error')
    }
  }

  async function handleBulkSetCategory() {
    if (!canBulkCategorize || selected.size === 0) return
    try {
      const n = await bulkSetCategory.mutateAsync({
        ids: Array.from(selected),
        categoryId: bulkCategoryId === '' ? null : bulkCategoryId,
      })
      toast(
        n.updated === 1
          ? 'Categoria aplicada a 1 transação.'
          : `Categoria aplicada a ${n.updated} transações.`,
        'success',
      )
      clearBulkSelection()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao aplicar categoria', 'error')
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await remove.mutateAsync(deleteId)
      toast('Transação movida para a lixeira.', 'success')
    } catch {
      toast('Erro ao excluir', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  const draftIdsOnPage = useMemo(
    () => transactions.filter((t) => t.status === 'DRAFT').map((t) => t.id),
    [transactions],
  )
  const allDraftsSelected =
    draftIdsOnPage.length > 0 &&
    selected.size === draftIdsOnPage.length &&
    draftIdsOnPage.every((id) => selected.has(id))

  return (
    <div
      className={cn(
        'flex flex-col gap-6 py-4 sm:gap-8 sm:py-6',
        showMobileBulkBar && 'pb-32 md:pb-0',
      )}
    >
      <EntryLaunchContextBar />

      {/* Painel operacional de critérios — grid estável */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="rounded-sm border border-border border-l-2 border-l-[#7CFC98] bg-card/80 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Critérios de busca
            </span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary">{activeFilterCount} ativo{activeFilterCount > 1 ? 's' : ''}</Badge>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="min-w-0 space-y-1 sm:col-span-1 lg:col-span-2">
              <Label
                htmlFor="tx-filter-type"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Tipo
              </Label>
              <Select
                id="tx-filter-type"
                className={filterSelectClass}
                value={filters.type ?? ''}
                onChange={(e) => setFilter('type', e.target.value)}
              >
                <option value="">Todos os tipos</option>
                <option value="INCOME">Receitas</option>
                <option value="EXPENSE">Despesas</option>
              </Select>
            </div>
            <div className="min-w-0 space-y-1 sm:col-span-1 lg:col-span-2">
              <Label
                htmlFor="tx-filter-status"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Status
              </Label>
              <Select
                id="tx-filter-status"
                className={filterSelectClass}
                value={filters.status ?? ''}
                onChange={(e) => setFilter('status', e.target.value)}
              >
                <option value="">Todos (ativas)</option>
                <option value="DRAFT">Rascunho</option>
                <option value="CONFIRMED">Confirmado</option>
              </Select>
            </div>
            <div className="min-w-0 space-y-1 sm:col-span-2 lg:col-span-3">
              <Label
                htmlFor="tx-filter-account"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Conta
              </Label>
              <Select
                id="tx-filter-account"
                className={filterSelectClass}
                value={filters.accountId ?? ''}
                onChange={(e) => setFilter('accountId', e.target.value)}
              >
                <option value="">Todas as contas</option>
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div
              className={cn(
                'min-w-0 space-y-1 sm:col-span-2',
                activeFilterCount > 0 ? 'lg:col-span-4' : 'lg:col-span-5',
              )}
            >
              <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Período
              </span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label
                    htmlFor="tx-filter-start"
                    className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    De
                  </Label>
                  <Input
                    id="tx-filter-start"
                    type="date"
                    className={filterDateClass}
                    value={filters.startDate ?? ''}
                    onChange={(e) => setFilter('startDate', e.target.value)}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <Label
                    htmlFor="tx-filter-end"
                    className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Até
                  </Label>
                  <Input
                    id="tx-filter-end"
                    type="date"
                    className={filterDateClass}
                    value={filters.endDate ?? ''}
                    onChange={(e) => setFilter('endDate', e.target.value)}
                  />
                </div>
              </div>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex sm:col-span-2 lg:col-span-1 lg:justify-self-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-full shrink-0 rounded-sm uppercase tracking-wide md:min-h-8 md:h-8 md:w-auto"
                  onClick={clearFilters}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>
        </div>
        {hasPeriodRange && (
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            Período: {formatDate(filters.startDate!)} — {formatDate(filters.endDate!)}
          </p>
        )}
      </div>

      {/* Lista */}
      <Card>
        <CardHeader className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <CardTitle className="text-base font-semibold tracking-tight">Transações</CardTitle>
            <Link
              href="/app/transacoes/lixeira"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-[#7CFC98]"
            >
              Lixeira
            </Link>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {selected.size > 0 && (
              <div className="hidden flex-col gap-2 md:flex">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="secondary" size="sm" className="rounded-sm" onClick={handleBulkConfirm}>
                    <CheckCheck className="h-4 w-4" aria-hidden />
                    Confirmar {selected.size}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-sm"
                    disabled={!canBulkCategorize}
                    title={
                      canBulkCategorize
                        ? undefined
                        : 'Selecione apenas receitas ou apenas despesas para categorizar em lote'
                    }
                    onClick={() => setBulkCategoryPanelOpen((o) => !o)}
                  >
                    <Tag className="h-4 w-4" aria-hidden />
                    Categorizar
                  </Button>
                </div>
                {bulkCategoryPanelOpen && canBulkCategorize && (
                  <div className="flex flex-col gap-2 rounded-sm border border-border bg-muted/30 p-3 sm:flex-row sm:items-end sm:justify-end">
                    <div className="min-w-0 flex-1 space-y-1 sm:max-w-xs">
                      <Label
                        htmlFor="bulk-category-select"
                        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        Categoria
                      </Label>
                      <Select
                        id="bulk-category-select"
                        className={filterSelectClass}
                        value={bulkCategoryId}
                        onChange={(e) => setBulkCategoryId(e.target.value)}
                      >
                        <option value="">Sem categoria</option>
                        {filteredBulkCategories?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0 rounded-sm"
                      isLoading={bulkSetCategory.isPending}
                      onClick={handleBulkSetCategory}
                    >
                      Aplicar a {selected.size}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
              <Button
                className="w-full rounded-sm sm:w-auto"
                onClick={() => {
                  setCreateEntry('default')
                  setShowForm(true)
                }}
              >
                <Plus className="h-4 w-4" aria-hidden /> Nova transação
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-sm border-[#285E38] text-[#8DDBA4] hover:bg-[#112417] hover:text-[#8DDBA4] sm:w-auto"
                onClick={() => {
                  setCreateEntry('card')
                  setShowForm(true)
                }}
              >
                <CreditCard className="h-4 w-4" aria-hidden /> No cartão
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <>
              <div className="divide-y divide-border md:hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                    <div className="flex justify-end gap-2">
                      <Skeleton className="h-11 w-11 shrink-0 rounded-sm" />
                      <Skeleton className="h-11 w-11 shrink-0 rounded-sm" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden divide-y divide-border md:block">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-4 w-20" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            </>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="rounded-sm border border-border bg-muted p-4">
                <Receipt className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Nenhum lançamento registrado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ajuste os critérios de busca ou registre um novo lançamento.
                </p>
              </div>
              <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
                <Button
                  size="sm"
                  className="w-full rounded-sm sm:flex-1"
                  onClick={() => {
                    setCreateEntry('default')
                    setShowForm(true)
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden /> Registrar à vista
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full rounded-sm border-[#285E38] text-[#8DDBA4] hover:bg-[#112417] hover:text-[#8DDBA4] sm:flex-1"
                  onClick={() => {
                    setCreateEntry('card')
                    setShowForm(true)
                  }}
                >
                  <CreditCard className="h-4 w-4" aria-hidden /> No cartão
                </Button>
              </div>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden">
                {transactions.map((t) => (
                  <li key={t.id} className="p-4">
                    <div className="flex items-start gap-3">
                      {t.status === 'DRAFT' ? (
                        <input
                          type="checkbox"
                          className="mt-1 size-4 shrink-0 rounded border-border"
                          checked={selected.has(t.id)}
                          onChange={() => toggleSelect(t.id)}
                          aria-label={`Selecionar rascunho: ${t.description}`}
                        />
                      ) : (
                        <span className="mt-1 w-4 shrink-0" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="whitespace-nowrap font-mono text-sm tabular-nums text-secondary-foreground">
                            {formatDate(t.date)}
                          </span>
                          <TransactionAmount t={t} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{t.description}</p>
                          {(() => {
                            const movement = transactionMovementLabel(t)
                            return movement ? (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{movement}</p>
                            ) : null
                          })()}
                          {t.creditCard && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Cartão: <span className="text-foreground/90">{t.creditCard.name}</span>
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {transactionNatureLabel(t) ? (
                              <Badge variant={natureBadgeVariant(t.nature)}>{transactionNatureLabel(t)}</Badge>
                            ) : null}
                            {t.linkedTransactionId ? (
                              <Badge variant="outline">Vínculo #{t.linkedTransactionId.slice(0, 8)}</Badge>
                            ) : null}
                          </div>
                          {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                        </div>
                        <dl className="grid gap-1 text-xs text-secondary-foreground">
                          <div className="flex flex-wrap gap-x-2">
                            <dt className="text-muted-foreground">Conta</dt>
                            <dd>{t.account?.name ?? '—'}</dd>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <dt className="text-muted-foreground">Categoria</dt>
                            <dd>
                              {t.category ? (
                                <Badge variant="secondary">{t.category.name}</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </dd>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <dt className="sr-only">Status</dt>
                            <dd className="flex flex-wrap items-center gap-1">
                              <StatusBadge status={t.status} />
                              {t.liquidated ? (
                                <Badge variant="outline" className="text-[10px]">
                                  Liquidado
                                </Badge>
                              ) : null}
                            </dd>
                          </div>
                        </dl>
                        <TransactionRowActions
                          t={t}
                          onConfirm={() => handleConfirm(t.id)}
                          onLiquidate={() => handleLiquidate(t.id)}
                          isLiquidating={liquidate.isPending && liquidate.variables?.id === t.id}
                          onEdit={() => {
                            setEditingTx(t)
                            setShowForm(true)
                          }}
                          onDelete={() => setDeleteId(t.id)}
                          variant="card"
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-border"
                          checked={allDraftsSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelected(new Set(transactions.filter((x) => x.status === 'DRAFT').map((x) => x.id)))
                            } else {
                              setSelected(new Set())
                            }
                          }}
                          aria-label="Selecionar todos os rascunhos visíveis na página"
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Conta</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categoria</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map((t) => (
                      <tr key={t.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3">
                          {t.status === 'DRAFT' && (
                            <input
                              type="checkbox"
                              className="size-4 rounded border-border"
                              checked={selected.has(t.id)}
                              onChange={() => toggleSelect(t.id)}
                              aria-label={`Selecionar rascunho: ${t.description}`}
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-secondary-foreground">{formatDate(t.date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{t.description}</p>
                          {(() => {
                            const movement = transactionMovementLabel(t)
                            return movement ? (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{movement}</p>
                            ) : null
                          })()}
                          {t.creditCard && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Cartão: <span className="text-foreground/90">{t.creditCard.name}</span>
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {transactionNatureLabel(t) ? (
                              <Badge variant={natureBadgeVariant(t.nature)}>{transactionNatureLabel(t)}</Badge>
                            ) : null}
                            {t.linkedTransactionId ? (
                              <Badge variant="outline">Vínculo #{t.linkedTransactionId.slice(0, 8)}</Badge>
                            ) : null}
                          </div>
                          {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                        </td>
                        <td className="px-4 py-3 text-secondary-foreground">{t.account?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          {t.category ? (
                            <Badge variant="secondary">{t.category.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <StatusBadge status={t.status} />
                            {t.liquidated ? (
                              <Badge variant="outline" className="text-[10px]">
                                Liquidado
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <TransactionAmount t={t} />
                        </td>
                        <td className="px-4 py-3">
                          <TransactionRowActions
                            t={t}
                            onConfirm={() => handleConfirm(t.id)}
                            onLiquidate={() => handleLiquidate(t.id)}
                            isLiquidating={liquidate.isPending && liquidate.variables?.id === t.id}
                            onEdit={() => {
                              setEditingTx(t)
                              setShowForm(true)
                            }}
                            onDelete={() => setDeleteId(t.id)}
                            variant="table"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
          <Button
            variant="outline"
            className="min-h-10 w-full rounded-sm sm:w-auto"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
          >
            Anterior
          </Button>
          <span className="flex flex-col items-center justify-center gap-0.5 text-center text-xs text-muted-foreground tabular-nums sm:text-sm">
            <span>Página {filters.page ?? 1}</span>
            <span className="text-muted-foreground/80">de {totalPages}</span>
          </span>
          <Button
            variant="outline"
            className="min-h-10 w-full rounded-sm sm:w-auto"
            disabled={(filters.page ?? 1) >= totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Próxima
          </Button>
        </div>
      )}

      {/* Barra de seleção — mobile */}
      {showMobileBulkBar && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm md:hidden"
          role="region"
          aria-label="Ações da seleção em lote"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                {selected.size === 1 ? '1 selecionada' : `${selected.size} selecionadas`}
              </p>
              <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={clearBulkSelection}>
                Limpar seleção
              </Button>
            </div>
            {bulkCategoryPanelOpen && canBulkCategorize && (
              <div className="max-h-[40vh] space-y-2 overflow-y-auto rounded-sm border border-border bg-muted/30 p-3">
                <Label
                  htmlFor="bulk-category-select-mobile"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Categoria
                </Label>
                <Select
                  id="bulk-category-select-mobile"
                  className={filterSelectClass}
                  value={bulkCategoryId}
                  onChange={(e) => setBulkCategoryId(e.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {filteredBulkCategories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  className="w-full rounded-sm"
                  isLoading={bulkSetCategory.isPending}
                  onClick={handleBulkSetCategory}
                >
                  Aplicar categoria a {selected.size}
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full rounded-sm"
                onClick={handleBulkConfirm}
              >
                <CheckCheck className="mr-2 h-4 w-4" aria-hidden />
                Confirmar {selected.size}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full rounded-sm"
                disabled={!canBulkCategorize}
                title={
                  canBulkCategorize
                    ? undefined
                    : 'Selecione apenas receitas ou apenas despesas para categorizar em lote'
                }
                onClick={() => setBulkCategoryPanelOpen((o) => !o)}
              >
                <Tag className="mr-2 h-4 w-4" aria-hidden />
                Categorizar
              </Button>
            </div>
          </div>
        </div>
      )}

      <TransactionForm
        open={showForm}
        onClose={() => {
          setShowForm(false)
          setEditingTx(undefined)
          setCreateEntry('default')
        }}
        transaction={editingTx}
        createEntry={editingTx ? undefined : createEntry}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Transação"
        description="A transação vai para a lixeira. Você pode restaurá-la ou apagá-la definitivamente na página Lixeira."
        isLoading={remove.isPending}
      />
    </div>
  )
}

function TransactionAmount({ t }: { t: Transaction }) {
  const isTransfer = t.recognition === 'TRANSFER_LEG'
  const isInvoicePay = t.recognition === 'INVOICE_PAYMENT'
  const isReimbursement = t.nature === 'REIMBURSEMENT'
  const displayedAmount = t.netAmount ?? t.amount
  return (
    <span
      className={cn(
        'font-mono text-sm font-semibold tabular-nums sm:text-base',
        isTransfer || isInvoicePay
          ? 'text-sky-300/90'
          : t.type === 'INCOME'
            ? 'text-emerald-400'
            : 'text-rose-400',
      )}
    >
      {t.type === 'INCOME' ? '+' : '-'}
      {formatCurrency(displayedAmount)}
      {isReimbursement ? (
        <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-[#86C3E6]">comp.</span>
      ) : null}
    </span>
  )
}

function TransactionRowActions({
  t,
  onConfirm,
  onLiquidate,
  isLiquidating,
  onEdit,
  onDelete,
  variant,
}: {
  t: Transaction
  onConfirm: () => void
  onLiquidate: () => void
  isLiquidating?: boolean
  onEdit: () => void
  onDelete: () => void
  variant: 'card' | 'table'
}) {
  const isCard = variant === 'card'
  const btnClass = cn(
    'inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
    'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    isCard ? 'size-11 min-h-11 min-w-11' : 'size-10 min-h-10 min-w-10 md:size-9 md:min-h-9 md:min-w-9',
  )
  const showLiquidate = !t.liquidated && t.status !== 'DELETED'

  return (
    <div className={cn('flex items-center', isCard ? 'justify-end gap-1 pt-1' : 'justify-end gap-0.5')}>
      {t.status === 'DRAFT' && (
        <button
          type="button"
          className={cn(btnClass, 'hover:text-emerald-600')}
          title="Confirmar"
          aria-label={`Confirmar transação: ${t.description}`}
          onClick={onConfirm}
        >
          <Check className="h-4 w-4" aria-hidden />
        </button>
      )}
      {showLiquidate && (
        <button
          type="button"
          className={cn(btnClass, 'hover:text-[#8DDBA4]')}
          title="Liquidar no caixa"
          aria-label={`Marcar como liquidado: ${t.description}`}
          disabled={isLiquidating}
          onClick={onLiquidate}
        >
          {isLiquidating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Banknote className="h-4 w-4" aria-hidden />
          )}
        </button>
      )}
      <button
        type="button"
        className={cn(btnClass, 'hover:text-foreground')}
        title="Editar"
        aria-label={`Editar transação: ${t.description}`}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        className={cn(btnClass, 'hover:text-rose-600')}
        title="Excluir"
        aria-label={`Excluir transação: ${t.description}`}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'CONFIRMED') return <Badge variant="success">Confirmado</Badge>
  if (status === 'DRAFT') return <Badge variant="warning">Rascunho</Badge>
  if (status === 'DELETED') return <Badge variant="destructive">Excluído</Badge>
  return <Badge variant="secondary">{status}</Badge>
}
