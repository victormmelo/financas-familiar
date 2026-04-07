'use client'

import { useState } from 'react'
import { Plus, Check, CheckCheck, Trash2, Pencil, Receipt, RotateCcw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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

  const { data, isLoading } = useTransactions(filters)
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const confirm = useConfirmTransaction()
  const bulkConfirm = useBulkConfirmTransactions()
  const remove = useDeleteTransaction()

  const transactions = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

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
      {/* Toolbar — painel operacional de critérios */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="rounded-sm border border-border border-l-2 border-l-[#7CFC98] bg-card/80 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Critérios de busca
              </span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary">{activeFilterCount} ativo{activeFilterCount > 1 ? 's' : ''}</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full space-y-1 sm:w-auto">
                <Label
                  htmlFor="tx-filter-type"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Tipo
                </Label>
                <Select
                  id="tx-filter-type"
                  className="h-8 w-full min-w-[10rem] text-sm sm:w-40"
                  value={filters.type ?? ''}
                  onChange={(e) => setFilter('type', e.target.value)}
                >
                  <option value="">Todos os tipos</option>
                  <option value="INCOME">Receitas</option>
                  <option value="EXPENSE">Despesas</option>
                </Select>
              </div>
              <div className="w-full space-y-1 sm:w-auto">
                <Label
                  htmlFor="tx-filter-status"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Status
                </Label>
                <Select
                  id="tx-filter-status"
                  className="h-8 w-full min-w-[10rem] text-sm sm:w-40"
                  value={filters.status ?? ''}
                  onChange={(e) => setFilter('status', e.target.value)}
                >
                  <option value="">Todos os status</option>
                  <option value="DRAFT">Rascunho</option>
                  <option value="CONFIRMED">Confirmado</option>
                </Select>
              </div>
              <div className="w-full space-y-1 sm:w-auto">
                <Label
                  htmlFor="tx-filter-account"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Conta
                </Label>
                <Select
                  id="tx-filter-account"
                  className="h-8 w-full min-w-[11rem] text-sm sm:w-44"
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
              <div className="w-full space-y-1 sm:w-auto">
                <Label
                  htmlFor="tx-filter-start"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  De
                </Label>
                <Input
                  id="tx-filter-start"
                  type="date"
                  className="h-8 w-full min-w-[10rem] rounded-sm font-mono text-sm tabular-nums sm:w-40"
                  value={filters.startDate ?? ''}
                  onChange={(e) => setFilter('startDate', e.target.value)}
                />
              </div>
              <div className="w-full space-y-1 sm:w-auto">
                <Label
                  htmlFor="tx-filter-end"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Até
                </Label>
                <Input
                  id="tx-filter-end"
                  type="date"
                  className="h-8 w-full min-w-[10rem] rounded-sm font-mono text-sm tabular-nums sm:w-40"
                  value={filters.endDate ?? ''}
                  onChange={(e) => setFilter('endDate', e.target.value)}
                />
              </div>
              {activeFilterCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-sm uppercase tracking-wide"
                  onClick={clearFilters}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>
          {hasPeriodRange && (
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              Período: {formatDate(filters.startDate!)} — {formatDate(filters.endDate!)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-end gap-2">
          {selected.size > 0 && (
            <Button variant="secondary" size="sm" onClick={handleBulkConfirm}>
              <CheckCheck className="h-4 w-4" />
              Confirmar {selected.size}
            </Button>
          )}
          <Button className="rounded-sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Nova transação
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
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
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{t.description}</p>
                        {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{t.account?.name ?? '—'}</td>
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
