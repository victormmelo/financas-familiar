'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Target,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccounts } from '@/hooks/use-accounts'
import { useTransactions } from '@/hooks/use-transactions'
import { useGoals } from '@/hooks/use-goals'
import { useBudgetSummary } from '@/hooks/use-budget-summary'
import { formatCurrency, currentMonth, getMonthName, cn } from '@/lib/utils'
import type { BudgetMonthlySummary } from '@financas/shared-types'

const CATEGORY_COLORS = ['#8DDBA4', '#F08D8D', '#86C3E6', '#E3CB67', '#7CFC98', '#63D985']

export default function DashboardPage() {
  const { month, year } = currentMonth()
  const { data: accounts } = useAccounts()
  const { data: transactionsData } = useTransactions({
    status: 'CONFIRMED',
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-31`,
    limit: 100,
  })
  const { data: summary, isLoading: summaryLoading } = useBudgetSummary({ month, year })
  const { data: goals } = useGoals()

  const totalBalance = useMemo(
    () => accounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0,
    [accounts],
  )

  const transactions = transactionsData?.data ?? []

  const monthIncome = useMemo(
    () => transactions.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0),
    [transactions],
  )
  const monthExpense = useMemo(
    () => transactions.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0),
    [transactions],
  )

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {}
    transactions
      .filter((t) => t.type === 'EXPENSE' && t.category)
      .forEach((t) => {
        const name = t.category!.name
        map[name] = (map[name] ?? 0) + t.amount
      })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [transactions])

  const topGoals = goals?.filter((g) => !g.isCompleted).slice(0, 3) ?? []

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Budget Semaphore — Hero */}
      {summaryLoading ? (
        <BudgetSemaphoreSkeleton />
      ) : summary ? (
        <BudgetSemaphore summary={summary} month={month} year={year} />
      ) : (
        <NoBudgetCard month={month} year={year} />
      )}

      {/* Secondary summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniCard
          label="Saldo total"
          value={formatCurrency(totalBalance)}
          valueClass={totalBalance >= 0 ? 'text-foreground' : 'text-[#F08D8D]'}
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
        />
        <MiniCard
          label={`Receitas — ${getMonthName(month)}`}
          value={formatCurrency(monthIncome)}
          valueClass="text-[#8DDBA4]"
          icon={<TrendingUp className="h-4 w-4 text-[#8DDBA4]" />}
        />
        <MiniCard
          label={`Despesas — ${getMonthName(month)}`}
          value={formatCurrency(monthExpense)}
          valueClass="text-[#F08D8D]"
          icon={<TrendingDown className="h-4 w-4 text-[#F08D8D]" />}
        />
        <MiniCard
          label="Saldo do mês"
          value={formatCurrency(monthIncome - monthExpense)}
          valueClass={monthIncome - monthExpense >= 0 ? 'text-[#8DDBA4]' : 'text-[#F08D8D]'}
          icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category breakdown from summary */}
        {summary && summary.byCategory.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Consumo por Categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary.byCategory.slice(0, 6).map((cat) => (
                  <div key={cat.categoryId}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{cat.categoryName}</span>
                      <span
                        className={cn(
                          'font-mono text-sm tabular-nums',
                          cat.isOverBudget ? 'text-[#F08D8D]' : 'text-muted-foreground',
                        )}
                      >
                        {formatCurrency(cat.spentAmount)}
                        {cat.budgetLimit > 0 && (
                          <span className="text-xs text-muted-foreground"> / {formatCurrency(cat.budgetLimit)}</span>
                        )}
                      </span>
                    </div>
                    {cat.budgetLimit > 0 && (
                      <div className="h-1 w-full rounded-sm bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-sm transition-all',
                            cat.isOverBudget
                              ? 'bg-[#F08D8D]'
                              : cat.usagePercent >= 80
                                ? 'bg-[#E3CB67]'
                                : 'bg-[#7CFC98]',
                          )}
                          style={{ width: `${Math.min(cat.usagePercent, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pie chart or accounts */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Despesas por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{
                      backgroundColor: '#182018',
                      border: '1px solid #3A463A',
                      borderRadius: '2px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-sm bg-muted p-4 border border-border">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Sem despesas no mês</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Accounts */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Contas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {accounts && accounts.filter((a) => a.isActive).length > 0 ? (
              <div className="space-y-2">
                {accounts.filter((a) => a.isActive).map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-7 w-7 rounded-sm flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: account.color ?? '#556B2F' }}
                      >
                        {account.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{account.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{account.type}</p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'font-mono text-sm font-semibold tabular-nums',
                        account.balance >= 0 ? 'text-foreground' : 'text-[#F08D8D]',
                      )}
                    >
                      {formatCurrency(account.balance)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-sm bg-muted p-4 border border-border">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Nenhuma conta cadastrada</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Goals */}
        {topGoals.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Metas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topGoals.map((g) => (
                  <div key={g.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{g.name}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {g.progressPercent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-sm bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-sm bg-[#7CFC98] transition-all"
                        style={{ width: `${Math.min(g.progressPercent, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {formatCurrency(g.currentAmount)}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {formatCurrency(g.targetAmount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent transactions */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Últimos Lançamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="divide-y divide-border">
              {transactions.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-7 w-7 rounded-sm flex items-center justify-center text-[10px] font-bold',
                        t.type === 'INCOME'
                          ? 'bg-[#112417] text-[#8DDBA4] border border-[#285E38]'
                          : 'bg-[#2A1212] text-[#F08D8D] border border-[#7A2A2A]',
                      )}
                    >
                      {t.type === 'INCOME' ? '+' : '-'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.description}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {t.account?.name} · {t.date}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-sm font-semibold tabular-nums',
                      t.type === 'INCOME' ? 'text-[#8DDBA4]' : 'text-[#F08D8D]',
                    )}
                  >
                    {t.type === 'INCOME' ? '+' : '-'}
                    {formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="rounded-sm bg-muted p-4 border border-border">
                <Receipt className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Nenhum lançamento no mês</p>
                <p className="text-xs text-muted-foreground mt-1">
                  As transações confirmadas aparecerão aqui
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Budget Semaphore (Hero) ───────────────────────────────────────────────────

function BudgetSemaphore({
  summary,
  month,
  year,
}: {
  summary: BudgetMonthlySummary
  month: number
  year: number
}) {
  const semaphoreConfig = {
    GREEN: {
      borderColor: 'border-[#285E38]',
      bgColor: 'bg-[#112417]',
      badgeBg: 'bg-[#112417] border border-[#285E38]',
      badgeText: 'text-[#8DDBA4]',
      badgeLabel: 'NO CONTROLE',
      icon: <CheckCircle2 className="h-5 w-5 text-[#8DDBA4]" />,
      varianceColor: 'text-[#8DDBA4]',
    },
    YELLOW: {
      borderColor: 'border-[#7A6416]',
      bgColor: 'bg-[#2B240D]',
      badgeBg: 'bg-[#2B240D] border border-[#7A6416]',
      badgeText: 'text-[#E3CB67]',
      badgeLabel: 'ATENÇÃO',
      icon: <AlertTriangle className="h-5 w-5 text-[#E3CB67]" />,
      varianceColor: 'text-[#E3CB67]',
    },
    RED: {
      borderColor: 'border-[#7A2A2A]',
      bgColor: 'bg-[#2A1212]',
      badgeBg: 'bg-[#2A1212] border border-[#7A2A2A]',
      badgeText: 'text-[#F08D8D]',
      badgeLabel: 'ORÇAMENTO COMPROMETIDO',
      icon: <XCircle className="h-5 w-5 text-[#F08D8D]" />,
      varianceColor: 'text-[#F08D8D]',
    },
  }[summary.status]

  const monthName = getMonthName(month)
  const isOver = summary.variance < 0
  const absVariance = Math.abs(summary.variance)
  const monthProgress = (summary.daysElapsed / summary.daysInMonth) * 100
  const spendProgress =
    summary.discretionaryBudget > 0
      ? (summary.discretionarySpent / summary.discretionaryBudget) * 100
      : 0

  return (
    <div
      className={cn(
        'rounded-sm border-2 p-6',
        semaphoreConfig.borderColor,
        semaphoreConfig.bgColor,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {semaphoreConfig.icon}
            <span
              className={cn(
                'text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-sm',
                semaphoreConfig.badgeBg,
                semaphoreConfig.badgeText,
              )}
            >
              {semaphoreConfig.badgeLabel}
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Orçamento de Consumo
          </h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">
            {monthName} {year} · Dia {summary.daysElapsed} de {summary.daysInMonth}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Taxa diária</p>
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(summary.dailyRate)}
            <span className="text-xs text-muted-foreground font-normal">/dia</span>
          </p>
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
        <MetricBlock
          label="Gasto até hoje"
          value={formatCurrency(summary.discretionarySpent)}
          valueClass="text-foreground"
        />
        <MetricBlock
          label={`Esperado (dia ${summary.daysElapsed})`}
          value={formatCurrency(summary.expectedToDate)}
          valueClass="text-muted-foreground"
        />
        <MetricBlock
          label={isOver ? 'Déficit' : 'Folga'}
          value={`${isOver ? '▼' : '▲'} ${formatCurrency(absVariance)}`}
          valueClass={semaphoreConfig.varianceColor}
        />
        <MetricBlock
          label="Projeção no mês"
          value={formatCurrency(summary.projectedMonthEnd)}
          valueClass={summary.projectedOverrun > 0 ? 'text-[#F08D8D]' : 'text-[#8DDBA4]'}
          sub={
            summary.projectedOverrun > 0
              ? `+${formatCurrency(summary.projectedOverrun)} acima`
              : `${formatCurrency(Math.abs(summary.projectedOverrun))} abaixo`
          }
        />
      </div>

      {/* Dual progress bars */}
      <div className="space-y-2">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Progresso do mês
            </span>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {summary.daysElapsed}/{summary.daysInMonth} dias
            </span>
          </div>
          <div className="h-2 w-full rounded-sm bg-[#1E281E] overflow-hidden">
            <div
              className="h-full rounded-sm bg-muted-foreground/40 transition-all"
              style={{ width: `${monthProgress}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Orçamento consumido
            </span>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {formatCurrency(summary.discretionarySpent)} / {formatCurrency(summary.discretionaryBudget)}
            </span>
          </div>
          <div className="h-2 w-full rounded-sm bg-[#1E281E] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-sm transition-all',
                spendProgress > 100
                  ? 'bg-[#F08D8D]'
                  : spendProgress > monthProgress + 5
                    ? 'bg-[#E3CB67]'
                    : 'bg-[#7CFC98]',
              )}
              style={{ width: `${Math.min(spendProgress, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Fixed expenses info */}
      {summary.fixedBudget > 0 && (
        <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Gastos fixos comprometidos
            </span>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatCurrency(summary.fixedSpent)} / {formatCurrency(summary.fixedBudget)}
          </span>
        </div>
      )}

      {/* Pending (future bills) info */}
      {summary.discretionaryCommitted > 0 && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Contas a pagar (pendentes)</span>
          <span className="font-mono text-xs tabular-nums text-[#E3CB67]">
            {formatCurrency(summary.discretionaryCommitted)} comprometido
          </span>
        </div>
      )}
    </div>
  )
}

function MetricBlock({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string
  value: string
  valueClass?: string
  sub?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={cn('font-mono text-base font-semibold tabular-nums', valueClass)}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

function MiniCard({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string
  value: string
  valueClass?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <span className={cn('font-mono text-lg font-semibold tabular-nums', valueClass)}>{value}</span>
    </div>
  )
}

function BudgetSemaphoreSkeleton() {
  return (
    <div className="rounded-sm border border-border bg-card p-6 space-y-4">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-full" />
      </div>
    </div>
  )
}

function NoBudgetCard({ month, year }: { month: number; year: number }) {
  return (
    <div className="rounded-sm border border-border bg-card p-6 flex flex-col items-center gap-3 py-10 text-center">
      <div className="rounded-sm bg-muted p-4 border border-border">
        <Target className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Nenhum orçamento configurado</p>
        <p className="text-xs text-muted-foreground mt-1">
          Configure orçamentos por categoria para ativar o acompanhamento de consumo em{' '}
          {getMonthName(month)} {year}
        </p>
      </div>
    </div>
  )
}
