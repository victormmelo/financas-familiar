'use client'

import type { ReactNode } from 'react'
import { Suspense, useEffect, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Wallet, CreditCard, Target, PieChart as PieIcon, Receipt } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { MonthNavigator } from '@/components/dashboard/month-navigator'
import { useAccounts } from '@/hooks/use-accounts'
import { useTransactions } from '@/hooks/use-transactions'
import { useBudgets } from '@/hooks/use-budgets'
import { useGoals } from '@/hooks/use-goals'
import {
  formatCurrency,
  formatDate,
  currentMonth,
  getMonthName,
  lastDayOfMonth,
  parseDashboardMonthParams,
  clampYearMonthNotAfter,
  shiftCalendarMonth,
  compareYearMonth,
  formatMonthYearLabel,
} from '@/lib/utils'
import { useMediaQuery } from '@/lib/use-media-query'
import DashboardRouteLoading from './loading'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4']

/** Alinhado a globals.css — card / border / foreground */
const chartTooltipStyle = {
  backgroundColor: 'hsl(120, 13%, 9%)',
  border: '1px solid hsl(120, 10%, 25%)',
  borderRadius: '6px',
} as const
const chartTooltipLabelColor = 'hsl(120, 27%, 92%)'

function categoryPieLabel(props: {
  name: string
  percent?: number
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
}) {
  const { name, percent, cx, cy, midAngle, innerRadius, outerRadius } = props
  const ir = innerRadius ?? 0
  const or = outerRadius ?? 0
  const radius = ir + (or - ir) * 0.65
  const angle = ((midAngle ?? 0) * Math.PI) / 180
  const cxN = cx ?? 0
  const cyN = cy ?? 0
  const x = cxN + radius * Math.cos(-angle)
  const y = cyN + radius * Math.sin(-angle)
  const pct = ((percent ?? 0) * 100).toFixed(0)
  return (
    <text
      x={x}
      y={y}
      fill={chartTooltipLabelColor}
      textAnchor={x > cxN ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={11}
    >
      {`${name} ${pct}%`}
    </text>
  )
}

function DashboardContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMdUp = useMediaQuery('(min-width: 768px)')
  const now = currentMonth()

  const ano = searchParams.get('ano')
  const mes = searchParams.get('mes')
  const parsed = useMemo(() => parseDashboardMonthParams(ano, mes), [ano, mes])
  const clamped = useMemo(
    () =>
      parsed ? clampYearMonthNotAfter(parsed.year, parsed.month, now) : now,
    [parsed, now.year, now.month],
  )

  useEffect(() => {
    const needDefault = parsed === null
    const needClamp =
      parsed !== null && (parsed.year !== clamped.year || parsed.month !== clamped.month)
    if (needDefault || needClamp) {
      router.replace(`${pathname}?ano=${clamped.year}&mes=${clamped.month}`, { scroll: false })
    }
  }, [parsed, clamped.year, clamped.month, pathname, router])

  const { year, month } = clamped
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const lastDay = lastDayOfMonth(year, month)

  const { data: accounts } = useAccounts({ asOfYear: year, asOfMonth: month })
  const { data: transactionsData } = useTransactions({
    status: 'CONFIRMED',
    startDate: `${ym}-01`,
    endDate: `${ym}-${String(lastDay).padStart(2, '0')}`,
    limit: 100,
  })
  const { data: budgets } = useBudgets({ referenceMonth: month, referenceYear: year })
  const { data: goals } = useGoals()

  const isCurrentMonth = year === now.year && month === now.month
  const canGoNext = compareYearMonth({ year, month }, now) < 0

  const goPrev = () => {
    const n = shiftCalendarMonth(year, month, -1)
    router.replace(`${pathname}?ano=${n.year}&mes=${n.month}`, { scroll: false })
  }

  const goNext = () => {
    if (!canGoNext) return
    const n = shiftCalendarMonth(year, month, 1)
    const c = clampYearMonthNotAfter(n.year, n.month, now)
    router.replace(`${pathname}?ano=${c.year}&mes=${c.month}`, { scroll: false })
  }

  const goCurrent = () => {
    router.replace(`${pathname}?ano=${now.year}&mes=${now.month}`, { scroll: false })
  }

  const totalBalance = useMemo(
    () => accounts?.reduce((sum, a) => sum + Number(a.balance), 0) ?? 0,
    [accounts],
  )

  const transactions = transactionsData?.data ?? []

  const monthIncome = useMemo(
    () =>
      transactions.filter((t) => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount), 0),
    [transactions],
  )
  const monthExpense = useMemo(
    () =>
      transactions.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0),
    [transactions],
  )

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {}
    transactions
      .filter((t) => t.type === 'EXPENSE' && t.category)
      .forEach((t) => {
        const name = t.category!.name
        map[name] = (map[name] ?? 0) + Number(t.amount)
      })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [transactions])

  const categoryTotal = useMemo(
    () => categoryData.reduce((sum, d) => sum + d.value, 0),
    [categoryData],
  )

  const budgetItems = budgets?.slice(0, 5) ?? []
  const topGoals = goals?.slice(0, 3) ?? []
  const monthBalance = monthIncome - monthExpense

  const monthTitle = getMonthName(month)
  const periodLabel = formatMonthYearLabel(year, month)

  return (
    <div className="flex flex-col gap-6 py-4 sm:gap-8 sm:py-6">
      <MonthNavigator
        year={year}
        month={month}
        canGoNext={canGoNext}
        onPrev={goPrev}
        onNext={goNext}
        onGoCurrent={goCurrent}
        showGoCurrent={!isCurrentMonth}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title={`Saldo total até ${monthTitle}`}
          value={formatCurrency(totalBalance)}
          icon={<Wallet className="h-5 w-5 text-primary" />}
          bg="bg-primary/10"
          valueClass={totalBalance >= 0 ? 'text-foreground' : 'text-rose-400'}
        />
        <SummaryCard
          title={`Receitas — ${monthTitle}`}
          value={formatCurrency(monthIncome)}
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          bg="bg-emerald-950/30"
          valueClass="text-emerald-400"
        />
        <SummaryCard
          title={`Despesas — ${monthTitle}`}
          value={formatCurrency(monthExpense)}
          icon={<TrendingDown className="h-5 w-5 text-rose-400" />}
          bg="bg-rose-950/30"
          valueClass="text-rose-400"
        />
        <SummaryCard
          title={`Saldo do mês (${monthTitle})`}
          value={formatCurrency(monthBalance)}
          icon={<CreditCard className="h-5 w-5 text-muted-foreground" />}
          bg="bg-muted"
          valueClass={monthBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Contas
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Saldos até o fim de {periodLabel} · contas já existentes nessa data
            </p>
          </CardHeader>
          <CardContent>
            {accounts && accounts.length > 0 ? (
              <div className="space-y-3">
                {accounts.filter((a) => a.isActive).map((account) => (
                  <div
                    key={account.id}
                    className="flex flex-col gap-2 border-b border-border py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: account.color ?? '#6366f1' }}
                      >
                        {account.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
                        <p className="text-xs text-muted-foreground">{account.type}</p>
                      </div>
                    </div>
                    <span
                      className={`self-end font-mono text-sm font-semibold tabular-nums sm:self-auto ${account.balance >= 0 ? 'text-foreground' : 'text-rose-400'}`}
                    >
                      {formatCurrency(account.balance)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-muted p-4">
                  <Wallet className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Nenhuma conta neste período</p>
                  <p className="text-sm text-muted-foreground">
                    Não havia contas ativas até o fim de {periodLabel}, ou nenhuma está cadastrada
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieIcon className="h-5 w-5" /> Despesas por categoria
            </CardTitle>
            <p className="text-xs text-muted-foreground">Somente {periodLabel}</p>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <div>
                <ResponsiveContainer width="100%" height={isMdUp ? 220 : 200}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={isMdUp ? 80 : 68}
                      labelLine={false}
                      label={isMdUp ? categoryPieLabel : false}
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => formatCurrency(v)}
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: chartTooltipLabelColor }}
                      itemStyle={{ color: chartTooltipLabelColor }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {!isMdUp && categoryTotal > 0 ? (
                  <ul className="mt-3 space-y-2 border-t border-border pt-3" aria-label="Legenda do gráfico">
                    {categoryData.map((d, i) => (
                      <li
                        key={d.name}
                        className="flex items-center justify-between gap-2 text-sm text-foreground"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                            aria-hidden
                          />
                          <span className="truncate">{d.name}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:text-sm">
                          {((d.value / categoryTotal) * 100).toFixed(0)}% · {formatCurrency(d.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-muted p-4">
                  <PieIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Sem despesas em {periodLabel}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orçamentos do mês</CardTitle>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </CardHeader>
          <CardContent>
            {budgetItems.length > 0 ? (
              <div className="space-y-4">
                {budgetItems.map((b) => (
                  <div key={b.id}>
                    <div className="mb-1 flex flex-col items-start gap-0.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:text-sm">
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {b.category?.name ?? '—'}
                      </span>
                      <span
                        className={`shrink-0 font-mono tabular-nums ${b.isOverBudget ? 'font-semibold text-rose-400' : 'text-muted-foreground'}`}
                      >
                        {formatCurrency(b.spentAmount)} / {formatCurrency(b.limitAmount)}
                      </span>
                    </div>
                    <ProgressBar
                      value={b.usagePercent}
                      barClassName={
                        b.isOverBudget
                          ? 'bg-rose-500'
                          : b.usagePercent >= 80
                            ? 'bg-amber-400'
                            : 'bg-primary'
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-muted p-4">
                  <PieIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhum orçamento para {periodLabel}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" /> Metas
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Progresso geral · não filtrado pelo mês selecionado
            </p>
          </CardHeader>
          <CardContent>
            {topGoals.length > 0 ? (
              <div className="space-y-4">
                {topGoals.map((g) => (
                  <div key={g.id}>
                    <div className="mb-1 flex flex-col items-start gap-0.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0 truncate font-medium text-foreground">{g.name}</span>
                      <span className="shrink-0 text-muted-foreground">{g.progressPercent.toFixed(0)}%</span>
                    </div>
                    <ProgressBar value={g.progressPercent} barClassName="bg-primary" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">{formatCurrency(g.currentAmount)}</span> de{' '}
                      <span className="font-mono tabular-nums">{formatCurrency(g.targetAmount)}</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-muted p-4">
                  <Target className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transações do mês</CardTitle>
          <p className="text-xs text-muted-foreground">Até 8 lançamentos recentes em {periodLabel}</p>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="divide-y divide-border">
              {transactions.slice(0, 8).map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${t.type === 'INCOME' ? 'bg-emerald-500' : 'bg-rose-400'}`}
                    >
                      {t.type === 'INCOME' ? '+' : '-'}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{t.description}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.account?.name} · {formatDate(t.date)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`self-end font-mono text-sm font-semibold tabular-nums sm:self-auto ${t.type === 'INCOME' ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {t.type === 'INCOME' ? '+' : '-'}
                    {formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="rounded-full bg-muted p-4">
                <Receipt className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Nenhuma transação em {periodLabel}</p>
                <p className="text-sm text-muted-foreground">Lançamentos confirmados aparecem aqui</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  icon,
  bg,
  valueClass = 'text-foreground',
}: {
  title: string
  value: string
  icon: ReactNode
  bg: string
  valueClass?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-balance text-sm text-muted-foreground">{title}</p>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>{icon}</div>
        </div>
        <p className={`font-mono text-xl font-semibold tabular-nums sm:text-2xl ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardRouteLoading />}>
      <DashboardContent />
    </Suspense>
  )
}
