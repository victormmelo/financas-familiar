'use client'

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Wallet, CreditCard, Target, PieChart as PieIcon, Receipt } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useAccounts } from '@/hooks/use-accounts'
import { useTransactions } from '@/hooks/use-transactions'
import { useBudgets } from '@/hooks/use-budgets'
import { useGoals } from '@/hooks/use-goals'
import { formatCurrency, currentMonth, getMonthName } from '@/lib/utils'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4']

export default function DashboardPage() {
  const { month, year } = currentMonth()
  const { data: accounts } = useAccounts()
  const { data: transactionsData } = useTransactions({
    status: 'CONFIRMED',
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-31`,
    limit: 100,
  })
  const { data: budgets } = useBudgets({ referenceMonth: month, referenceYear: year })
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

  const budgetItems = budgets?.slice(0, 5) ?? []
  const topGoals = goals?.slice(0, 3) ?? []
  const monthBalance = monthIncome - monthExpense

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Saldo Total"
          value={formatCurrency(totalBalance)}
          icon={<Wallet className="h-5 w-5 text-primary" />}
          bg="bg-primary/10"
          valueClass={totalBalance >= 0 ? 'text-foreground' : 'text-rose-600 dark:text-rose-400'}
        />
        <SummaryCard
          title={`Receitas — ${getMonthName(month)}`}
          value={formatCurrency(monthIncome)}
          icon={<TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          bg="bg-emerald-50 dark:bg-emerald-900/20"
          valueClass="text-emerald-600 dark:text-emerald-400"
        />
        <SummaryCard
          title={`Despesas — ${getMonthName(month)}`}
          value={formatCurrency(monthExpense)}
          icon={<TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
          bg="bg-rose-50 dark:bg-rose-900/20"
          valueClass="text-rose-600 dark:text-rose-400"
        />
        <SummaryCard
          title="Saldo do Mês"
          value={formatCurrency(monthBalance)}
          icon={<CreditCard className="h-5 w-5 text-muted-foreground" />}
          bg="bg-muted"
          valueClass={monthBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Contas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {accounts && accounts.length > 0 ? (
              <div className="space-y-3">
                {accounts.filter((a) => a.isActive).map((account) => (
                  <div key={account.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: account.color ?? '#6366f1' }}
                      >
                        {account.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{account.name}</p>
                        <p className="text-xs text-muted-foreground">{account.type}</p>
                      </div>
                    </div>
                    <span className={`font-mono text-sm font-semibold tabular-nums ${account.balance >= 0 ? 'text-foreground' : 'text-rose-600 dark:text-rose-400'}`}>
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
                  <p className="font-medium">Nenhuma conta cadastrada</p>
                  <p className="text-sm text-muted-foreground">Adicione sua primeira conta</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieIcon className="h-5 w-5" /> Despesas por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-muted p-4">
                  <PieIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Sem despesas no mês</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Budgets */}
        <Card>
          <CardHeader>
            <CardTitle>Orçamentos do Mês</CardTitle>
          </CardHeader>
          <CardContent>
            {budgetItems.length > 0 ? (
              <div className="space-y-4">
                {budgetItems.map((b) => (
                  <div key={b.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-foreground">{b.category?.name ?? '—'}</span>
                      <span className={b.isOverBudget ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-muted-foreground'}>
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
                <p className="text-sm text-muted-foreground">Nenhum orçamento para o mês</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Goals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" /> Metas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topGoals.length > 0 ? (
              <div className="space-y-4">
                {topGoals.map((g) => (
                  <div key={g.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-foreground">{g.name}</span>
                      <span className="text-muted-foreground">{g.progressPercent.toFixed(0)}%</span>
                    </div>
                    <ProgressBar value={g.progressPercent} barClassName="bg-primary" />
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-mono tabular-nums">{formatCurrency(g.currentAmount)}</span>
                      {' '}de{' '}
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

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Últimas Transações</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="divide-y divide-border">
              {transactions.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${t.type === 'INCOME' ? 'bg-emerald-500' : 'bg-rose-400'}`}>
                      {t.type === 'INCOME' ? '+' : '-'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.description}</p>
                      <p className="text-xs text-muted-foreground">{t.account?.name} · {t.date}</p>
                    </div>
                  </div>
                  <span className={`font-mono text-sm font-semibold tabular-nums ${t.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
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
                <p className="font-medium">Nenhuma transação no mês</p>
                <p className="text-sm text-muted-foreground">As transações confirmadas aparecerão aqui</p>
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
  icon: React.ReactNode
  bg: string
  valueClass?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center`}>{icon}</div>
        </div>
        <p className={`font-mono text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
