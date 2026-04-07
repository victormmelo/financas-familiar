'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Check, CheckCheck, Trash2, Pencil, Receipt, RotateCcw, Tag } from 'lucide-react'
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
  type Transaction,
  type TransactionFilters,
} from '@/hooks/use-transactions'
import { useAccounts } from '@/hooks/use-accounts'
import { useCategories } from '@/hooks/use-categories'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function TransacoesPage() {
  const { toast } = useToast()
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1, limit: 20 })
  const [showForm, setShowForm] = useState(false)
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

  async function handleBulkConfirm() {
    try {
      await bulkConfirm.mutateAsync(Array.from(selected))
      toast(`${selected.size} transações confirmadas!`, 'success')
      setSelected(new Set())
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
      setSelected(new Set())
      setBulkCategoryPanelOpen(false)
      setBulkCategoryId('')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao aplicar categoria', 'error')
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await remove.mutateAsync(deleteId)
      toast('Transação excluída', 'success')
    } catch {
      toast('Erro ao excluir', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Painel operacional de critérios — grid estável */}
      <div className="flex flex-col gap-2">
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
            <div className="space-y-1 sm:col-span-1 lg:col-span-2">
              <Label
                htmlFor="tx-filter-type"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Tipo
              </Label>
              <Select
                id="tx-filter-type"
                className="h-8 w-full text-sm"
                value={filters.type ?? ''}
                onChange={(e) => setFilter('type', e.target.value)}
              >
                <option value="">Todos os tipos</option>
                <option value="INCOME">Receitas</option>
                <option value="EXPENSE">Despesas</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-1 lg:col-span-2">
              <Label
                htmlFor="tx-filter-status"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Status
              </Label>
              <Select
                id="tx-filter-status"
                className="h-8 w-full text-sm"
                value={filters.status ?? ''}
                onChange={(e) => setFilter('status', e.target.value)}
              >
                <option value="">Todos os status</option>
                <option value="DRAFT">Rascunho</option>
                <option value="CONFIRMED">Confirmado</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <Label
                htmlFor="tx-filter-account"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Conta
              </Label>
              <Select
                id="tx-filter-account"
                className="h-8 w-full text-sm"
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
              className={`space-y-1 sm:col-span-2 ${activeFilterCount > 0 ? 'lg:col-span-4' : 'lg:col-span-5'}`}
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
                    className="h-8 w-full rounded-sm font-mono text-sm tabular-nums"
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
                    className="h-8 w-full rounded-sm font-mono text-sm tabular-nums"
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
                  className="h-8 w-full shrink-0 rounded-sm uppercase tracking-wide sm:w-auto"
                  onClick={clearFilters}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
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

      {/* Tabela */}
      <Card>
        <CardHeader className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardTitle className="text-base font-semibold tracking-tight">Transações</CardTitle>
          <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:ml-auto sm:max-w-none sm:items-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selected.size > 0 && (
                <>
                  <Button variant="secondary" size="sm" className="rounded-sm" onClick={handleBulkConfirm}>
                    <CheckCheck className="h-4 w-4" />
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
                    <Tag className="h-4 w-4" />
                    Categorizar
                  </Button>
                </>
              )}
              <Button className="rounded-sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Nova transação
              </Button>
            </div>
            {selected.size > 0 && bulkCategoryPanelOpen && canBulkCategorize && (
              <div className="flex w-full min-w-0 flex-col gap-2 rounded-sm border border-border bg-muted/30 p-3 sm:flex-row sm:items-end sm:justify-end">
                <div className="min-w-0 flex-1 space-y-1 sm:max-w-xs">
                  <Label
                    htmlFor="bulk-category-select"
                    className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Categoria
                  </Label>
                  <Select
                    id="bulk-category-select"
                    className="h-8 w-full text-sm"
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
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
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
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="rounded-sm border border-border bg-muted p-4">
                <Receipt className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Nenhum lançamento registrado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ajuste os critérios de busca ou registre um novo lançamento.
                </p>
              </div>
              <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Registrar lançamento
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.size === transactions.filter((t) => t.status === 'DRAFT').length && transactions.some((t) => t.status === 'DRAFT')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelected(new Set(transactions.filter((t) => t.status === 'DRAFT').map((t) => t.id)))
                          } else {
                            setSelected(new Set())
                          }
                        }}
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
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        {t.status === 'DRAFT' && (
                          <input
                            type="checkbox"
                            checked={selected.has(t.id)}
                            onChange={() => toggleSelect(t.id)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-secondary-foreground">{formatDate(t.date)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{t.description}</p>
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
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={`font-mono font-semibold tabular-nums ${t.type === 'INCOME' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {t.status === 'DRAFT' && (
                            <button
                              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-emerald-600"
                              title="Confirmar"
                              onClick={() => handleConfirm(t.id)}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                            title="Editar"
                            onClick={() => { setEditingTx(t); setShowForm(true) }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-rose-600"
                            title="Excluir"
                            onClick={() => setDeleteId(t.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
          >
            Anterior
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            Página {filters.page ?? 1} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(filters.page ?? 1) >= totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Próxima
          </Button>
        </div>
      )}

      <TransactionForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingTx(undefined) }}
        transaction={editingTx}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Transação"
        description="Esta ação não pode ser desfeita. Deseja continuar?"
        isLoading={remove.isPending}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'CONFIRMED') return <Badge variant="success">Confirmado</Badge>
  if (status === 'DRAFT') return <Badge variant="warning">Rascunho</Badge>
  if (status === 'DELETED') return <Badge variant="destructive">Excluído</Badge>
  return <Badge variant="secondary">{status}</Badge>
}
