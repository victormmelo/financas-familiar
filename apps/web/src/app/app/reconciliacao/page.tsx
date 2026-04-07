'use client'

import { useState } from 'react'
import { RefreshCw, Upload, Plus, CheckCircle, XCircle, MinusCircle, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ImportStatementForm } from '@/components/forms/import-statement-form'
import { StatementItemForm } from '@/components/forms/statement-item-form'
import { BalanceCheckForm } from '@/components/forms/balance-check-form'
import { useAccounts } from '@/hooks/use-accounts'
import {
  useStatementItems,
  useAcceptMatch,
  useRejectMatch,
  useIgnoreItem,
  useConvertItem,
  useRunMatching,
} from '@/hooks/use-reconciliation'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { StatementItem, StatementItemStatus } from '@financas/shared-types'

// ─── Status badge config ──────────────────────────────────────────────────────

const statusConfig: Record<StatementItemStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-amber-950/40 text-amber-400' },
  MATCHED: { label: 'Correspondido', className: 'bg-emerald-950/40 text-emerald-400' },
  REJECTED: { label: 'Rejeitado', className: 'bg-rose-950/40 text-rose-400' },
  IGNORED: { label: 'Ignorado', className: 'bg-muted text-muted-foreground' },
  CONVERTED: { label: 'Convertido', className: 'bg-sky-950/40 text-sky-400' },
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>
  const cls =
    score >= 85
      ? 'bg-emerald-950/40 text-emerald-400'
      : score >= 70
        ? 'bg-amber-950/40 text-amber-400'
        : 'bg-muted text-muted-foreground'
  const label = score >= 85 ? 'Alta' : 'Média'
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      {label} ({score})
    </span>
  )
}

// ─── Row actions ──────────────────────────────────────────────────────────────

function ItemActions({ item }: { item: StatementItem }) {
  const acceptMatch = useAcceptMatch()
  const rejectMatch = useRejectMatch()
  const ignoreItem = useIgnoreItem()
  const convertItem = useConvertItem()
  const { toast } = useToast()

  const isPending = item.status === 'PENDING'
  const isRejected = item.status === 'REJECTED'
  const hasSuggestion = item.matchedTransactionId !== null

  if (!isPending && !isRejected) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  return (
    <div className="flex items-center gap-1">
      {hasSuggestion && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800"
          disabled={acceptMatch.isPending}
          onClick={() =>
            acceptMatch.mutate(
              { id: item.id, transactionId: item.matchedTransactionId! },
              { onError: (e) => toast(e.message ?? 'Erro ao aceitar match', 'error') },
            )
          }
        >
          <CheckCircle className="mr-1 h-3 w-3" />
          Aceitar
        </Button>
      )}
      {hasSuggestion && isPending && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs text-rose-700 hover:text-rose-800"
          disabled={rejectMatch.isPending}
          onClick={() =>
            rejectMatch.mutate(item.id, {
              onError: (e) => toast(e.message ?? 'Erro ao rejeitar match', 'error'),
            })
          }
        >
          <XCircle className="mr-1 h-3 w-3" />
          Rejeitar
        </Button>
      )}
      {!hasSuggestion && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={convertItem.isPending}
          onClick={() =>
            convertItem.mutate(
              { id: item.id },
              {
                onSuccess: () => toast('Transação criada como rascunho', 'success'),
                onError: (e) => toast(e.message ?? 'Erro ao converter item', 'error'),
              },
            )
          }
        >
          <ArrowRightLeft className="mr-1 h-3 w-3" />
          Converter
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs text-muted-foreground"
        disabled={ignoreItem.isPending}
        onClick={() =>
          ignoreItem.mutate(item.id, {
            onError: (e) => toast(e.message ?? 'Erro ao ignorar item', 'error'),
          })
        }
      >
        <MinusCircle className="mr-1 h-3 w-3" />
        Ignorar
      </Button>
    </div>
  )
}

// ─── Import Tab ───────────────────────────────────────────────────────────────

function ImportTab() {
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showManualDialog, setShowManualDialog] = useState(false)
  const [filters, setFilters] = useState<{
    accountId: string
    status: string
    startDate: string
    endDate: string
    page: number
  }>({ accountId: '', status: '', startDate: '', endDate: '', page: 1 })

  const { data: accounts } = useAccounts()
  const runMatching = useRunMatching()
  const { toast } = useToast()

  const queryFilters = {
    page: filters.page,
    limit: 20,
    ...(filters.accountId && { accountId: filters.accountId }),
    ...(filters.status && { status: filters.status as StatementItemStatus }),
    ...(filters.startDate && { startDate: filters.startDate }),
    ...(filters.endDate && { endDate: filters.endDate }),
  }

  const { data, isLoading } = useStatementItems(queryFilters)
  const items = data?.data ?? []
  const meta = data?.meta

  function handleRunMatching() {
    if (!filters.accountId) {
      toast('Selecione uma conta para rodar o matching', 'error')
      return
    }
    if (!filters.startDate || !filters.endDate) {
      toast('Selecione o período para rodar o matching', 'error')
      return
    }
    runMatching.mutate(
      { accountId: filters.accountId, startDate: filters.startDate, endDate: filters.endDate },
      {
        onSuccess: (r) => {
          const d = r.data
          toast(
            `Matching concluído: ${d.matched} correspondências · ${d.unmatched} sem match`,
            'success',
          )
        },
        onError: (e) => toast(e.message ?? 'Erro no matching', 'error'),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Conta</Label>
          <Select
            className="h-8 w-44 text-sm"
            value={filters.accountId}
            onChange={(e) => setFilters((f) => ({ ...f, accountId: e.target.value, page: 1 }))}
          >
            <option value="">Todas as contas</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select
            className="h-8 w-40 text-sm"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          >
            <option value="">Todos</option>
            <option value="PENDING">Pendente</option>
            <option value="MATCHED">Correspondido</option>
            <option value="REJECTED">Rejeitado</option>
            <option value="IGNORED">Ignorado</option>
            <option value="CONVERTED">Convertido</option>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input
            type="date"
            className="h-8 w-36 text-sm"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value, page: 1 }))}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input
            type="date"
            className="h-8 w-36 text-sm"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value, page: 1 }))}
          />
        </div>

        <div className="ml-auto flex items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRunMatching}
            disabled={runMatching.isPending}
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', runMatching.isPending && 'animate-spin')} />
            Rodar Matching
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Importar Arquivo
          </Button>
          <Button size="sm" onClick={() => setShowManualDialog(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Adicionar Manual
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Score</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      </tr>
                    ))
                  : items.length === 0
                    ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <div className="rounded-full bg-muted p-4">
                              <RefreshCw className="h-6 w-6" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">Nenhum item encontrado</p>
                              <p className="text-sm">Importe um extrato ou adicione manualmente</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                    : items.map((item) => {
                      const cfg = statusConfig[item.status]
                      return (
                        <tr key={item.id} className="border-b transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(item.date)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{item.description}</span>
                              {item.matchedTransaction && (
                                <span className="text-xs text-muted-foreground">
                                  → {item.matchedTransaction.description}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'text-xs font-medium',
                                item.type === 'INCOME' ? 'text-emerald-400' : 'text-rose-400',
                              )}
                            >
                              {item.type === 'INCOME' ? 'Crédito' : 'Débito'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            <span
                              className={
                                item.type === 'INCOME' ? 'text-emerald-400' : 'text-rose-400'
                              }
                            >
                              {item.type === 'INCOME' ? '+' : '-'} {formatCurrency(item.amount)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ScoreBadge score={item.matchScore} />
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                cfg.className,
                              )}
                            >
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ItemActions item={item} />
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                {meta.total} itens · página {meta.page} de {meta.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={filters.page >= meta.totalPages}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ImportStatementForm open={showImportDialog} onClose={() => setShowImportDialog(false)} />
      <StatementItemForm
        open={showManualDialog}
        onClose={() => setShowManualDialog(false)}
        defaultAccountId={filters.accountId}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'import' | 'balance'

export default function ReconciliacaoPage() {
  const [tab, setTab] = useState<Tab>('import')
  const [pendingAccountId, setPendingAccountId] = useState('')

  function handleViewPendingItems(accountId: string) {
    setPendingAccountId(accountId)
    setTab('import')
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliação</h1>
          <p className="text-sm text-muted-foreground">
            Compare extratos bancários com seus lançamentos
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
        <button
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'import'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setTab('import')}
        >
          Import & Matching
        </button>
        <button
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'balance'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setTab('balance')}
        >
          Verificação de Saldo
        </button>
      </div>

      {/* Tab content */}
      {tab === 'import' && <ImportTab key={pendingAccountId} />}
      {tab === 'balance' && <BalanceCheckForm onViewPendingItems={handleViewPendingItems} />}
    </div>
  )
}
