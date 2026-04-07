'use client'

import { useState } from 'react'
import { Plus, ArrowRight, ArrowLeftRight, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TransferForm } from '@/components/forms/transfer-form'
import { useTransfers, type TransferFilters } from '@/hooks/use-transfers'
import { useAccounts } from '@/hooks/use-accounts'
import { formatCurrency, formatDate, cn } from '@/lib/utils'

const filterSelectClass =
  'h-10 min-h-10 w-full text-sm md:h-8 md:min-h-0'
const filterDateClass =
  'h-10 min-h-10 w-full rounded-sm font-mono text-sm tabular-nums md:h-8 md:min-h-0'

export default function TransferenciasPage() {
  const [filters, setFilters] = useState<TransferFilters>({ page: 1, limit: 20 })
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useTransfers(filters)
  const { data: accounts } = useAccounts()

  const transfers = data?.data ?? []
  const totalPages = data?.totalPages ?? 1
  const totalCount = data?.total ?? 0

  function setFilter(key: keyof TransferFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }))
  }

  function clearFilters() {
    setFilters({ page: 1, limit: 20 })
  }

  const activeFilterCount = [
    filters.fromAccountId,
    filters.toAccountId,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length

  const hasPeriodRange = Boolean(filters.startDate && filters.endDate)

  return (
    <div className="flex flex-col gap-6 py-4 sm:gap-8 sm:py-6">
      <div className="flex min-w-0 flex-col gap-2 px-6 sm:px-0">
        <div className="rounded-sm border border-border border-l-2 border-l-[#7CFC98] bg-card/80 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Critérios de busca
            </span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary">
                {activeFilterCount} ativo{activeFilterCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="min-w-0 space-y-1 sm:col-span-1 lg:col-span-3">
              <Label
                htmlFor="tr-filter-from"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Conta origem
              </Label>
              <Select
                id="tr-filter-from"
                className={filterSelectClass}
                value={filters.fromAccountId ?? ''}
                onChange={(e) => setFilter('fromAccountId', e.target.value)}
              >
                <option value="">Todas</option>
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0 space-y-1 sm:col-span-1 lg:col-span-3">
              <Label
                htmlFor="tr-filter-to"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Conta destino
              </Label>
              <Select
                id="tr-filter-to"
                className={filterSelectClass}
                value={filters.toAccountId ?? ''}
                onChange={(e) => setFilter('toAccountId', e.target.value)}
              >
                <option value="">Todas</option>
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
                    htmlFor="tr-filter-start"
                    className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    De
                  </Label>
                  <Input
                    id="tr-filter-start"
                    type="date"
                    className={filterDateClass}
                    value={filters.startDate ?? ''}
                    onChange={(e) => setFilter('startDate', e.target.value)}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <Label
                    htmlFor="tr-filter-end"
                    className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Até
                  </Label>
                  <Input
                    id="tr-filter-end"
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
          <p className="px-0 font-mono text-xs text-muted-foreground tabular-nums">
            Período: {formatDate(filters.startDate!)} — {formatDate(filters.endDate!)}
          </p>
        )}
      </div>

      <div className="flex justify-end px-6 sm:px-0">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Nova Transferência
        </Button>
      </div>

      <Card className="mx-6 sm:mx-0">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-base font-semibold tracking-tight">Transferências</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <div className="rounded-full bg-muted p-4">
                <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">
                  {activeFilterCount > 0
                    ? 'Nenhuma transferência encontrada'
                    : 'Nenhuma transferência registrada'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {activeFilterCount > 0
                    ? 'Ajuste os critérios ou limpe os filtros.'
                    : 'Movimente valores entre suas contas'}
                </p>
              </div>
              {activeFilterCount === 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4" /> Nova transferência
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transfers.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-950/40">
                      <ArrowRight className="h-4 w-4 text-sky-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span>{t.fromAccount?.name ?? '—'}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span>{t.toAccount?.name ?? '—'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.date)}
                        {t.description ? ` · ${t.description}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-sky-400">
                    ↔ {formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex flex-col items-stretch gap-3 px-6 sm:flex-row sm:items-center sm:justify-center sm:gap-4 sm:px-0">
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

      <TransferForm open={showForm} onClose={() => setShowForm(false)} />
    </div>
  )
}
