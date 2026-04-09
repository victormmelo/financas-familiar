'use client'

import { useState } from 'react'
import { Plus, Repeat2, CalendarDays, Wallet, Tag, XCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TransactionForm } from '@/components/forms/transaction-form'
import {
  useRecurringTemplates,
  useCancelRecurringTemplate,
  type Transaction,
} from '@/hooks/use-transactions'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, cn } from '@/lib/utils'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FREQ_MAP: Record<string, string> = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
}

function humanizeRRule(rrule: string | null | undefined): string {
  if (!rrule) return 'Recorrente'
  const match = rrule.match(/FREQ=(\w+)/)
  return match ? (FREQ_MAP[match[1]] ?? 'Recorrente') : 'Recorrente'
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function TemplateCardSkeleton() {
  return (
    <div className="rounded-sm border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  )
}

function FreqBadge({ rrule }: { rrule: string | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-[#28546A] bg-[#10202A] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#86C3E6]">
      <Repeat2 className="h-2.5 w-2.5" />
      {humanizeRRule(rrule)}
    </span>
  )
}

function TypeBadge({ type }: { type: 'INCOME' | 'EXPENSE' }) {
  return type === 'INCOME' ? (
    <span className="inline-flex rounded-sm border border-[#285E38] bg-[#112417] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8DDBA4]">
      Receita
    </span>
  ) : (
    <span className="inline-flex rounded-sm border border-[#7A2A2A] bg-[#2A1212] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F08D8D]">
      Despesa
    </span>
  )
}

function TemplateCard({
  template,
  onCancel,
}: {
  template: Transaction
  onCancel: (t: Transaction) => void
}) {
  const amountClass = template.type === 'INCOME' ? 'text-[#8DDBA4]' : 'text-[#F08D8D]'
  const amountPrefix = template.type === 'INCOME' ? '+' : '-'

  return (
    <div className="rounded-sm border border-border bg-card p-4 transition-colors hover:border-border/80">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{template.description}</p>
          {template.notes && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{template.notes}</p>
          )}
        </div>
        <span className={cn('font-mono text-base font-semibold tabular-nums shrink-0', amountClass)}>
          {amountPrefix} {formatCurrency(Math.abs(template.amount))}
        </span>
      </div>

      {/* Meta row */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {template.account && (
          <span className="flex items-center gap-1">
            <Wallet className="h-3 w-3" />
            {template.account.name}
          </span>
        )}
        {template.category && (
          <span className="flex items-center gap-1">
            <Tag className="h-3 w-3" />
            {template.category.name}
          </span>
        )}
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          Criada em {formatDate(template.createdAt)}
        </span>
      </div>

      {/* Badges + próximas datas */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TypeBadge type={template.type} />
        <FreqBadge rrule={template.rrule} />
      </div>

      {template.nextOccurrences && template.nextOccurrences.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Próximos vencimentos
          </p>
          <div className="flex flex-wrap gap-1.5">
            {template.nextOccurrences.slice(0, 5).map((date) => (
              <span
                key={date}
                className="rounded-sm border border-border bg-muted px-2 py-0.5 font-mono text-[10px] tabular-nums text-foreground"
              >
                {formatDate(date)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex justify-end border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-[#F08D8D] hover:bg-[#2A1212] hover:text-[#F08D8D]"
          onClick={() => onCancel(template)}
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancelar recorrência
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContasFixasPage() {
  const { toast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Transaction | null>(null)

  const { data: templates, isLoading } = useRecurringTemplates()
  const cancel = useCancelRecurringTemplate()

  async function handleConfirmCancel() {
    if (!cancelTarget) return
    try {
      await cancel.mutateAsync(cancelTarget.id)
      toast('Recorrência cancelada. Rascunhos futuros removidos.', 'success')
    } catch {
      toast('Erro ao cancelar recorrência.', 'error')
    } finally {
      setCancelTarget(null)
    }
  }

  const income = templates?.filter((t) => t.type === 'INCOME') ?? []
  const expense = templates?.filter((t) => t.type === 'EXPENSE') ?? []

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contas Fixas</h1>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Recorrências automáticas
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="gap-2 rounded-sm"
        >
          <Plus className="h-4 w-4" />
          Nova conta fixa
        </Button>
      </div>

      {/* Summary strip */}
      {!isLoading && templates && templates.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-sm border border-border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total ativo</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
              {templates.length}
            </p>
          </div>
          <div className="rounded-sm border border-border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Receitas fixas</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#8DDBA4]">
              {income.length}
            </p>
          </div>
          <div className="rounded-sm border border-border bg-card p-3 col-span-2 sm:col-span-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Despesas fixas</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#F08D8D]">
              {expense.length}
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <TemplateCardSkeleton key={i} />
          ))}
        </div>
      ) : !templates || templates.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="rounded-sm border border-border bg-muted p-4">
            <Repeat2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Nenhuma conta fixa cadastrada</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastre receitas e despesas recorrentes para geração automática de rascunhos
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 rounded-sm" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5" />
            Cadastrar conta fixa
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Despesas */}
          {expense.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Despesas fixas ({expense.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {expense.map((t) => (
                  <TemplateCard key={t.id} template={t} onCancel={setCancelTarget} />
                ))}
              </div>
            </section>
          )}

          {/* Receitas */}
          {income.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Receitas fixas ({income.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {income.map((t) => (
                  <TemplateCard key={t.id} template={t} onCancel={setCancelTarget} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Transaction form — opens in recurring mode */}
      <TransactionForm
        open={showForm}
        onClose={() => setShowForm(false)}
        defaultMode="recurring"
      />

      {/* Cancel confirm dialog */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => void handleConfirmCancel()}
        title="Cancelar recorrência"
        description={
          cancelTarget
            ? `Deseja cancelar a recorrência "${cancelTarget.description}"? Todos os rascunhos futuros gerados por ela serão removidos. Lançamentos já confirmados não serão afetados.`
            : ''
        }
        confirmLabel="Cancelar recorrência"
        variant="destructive"
        isLoading={cancel.isPending}
      />
    </div>
  )
}
