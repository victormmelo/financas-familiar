'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAccounts } from '@/hooks/use-accounts'
import { useBalanceSummary } from '@/hooks/use-reconciliation'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { CheckCircle, AlertTriangle, Receipt } from 'lucide-react'

interface Props {
  onViewPendingItems?: (accountId: string) => void
}

export function BalanceCheckForm({ onViewPendingItems }: Props) {
  const { data: accounts } = useAccounts()
  const [accountId, setAccountId] = useState('')
  const [reportedBalanceInput, setReportedBalanceInput] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const reportedBalance = parseFloat(reportedBalanceInput.replace(',', '.'))
  const isValidInput = accountId && !isNaN(reportedBalance)

  const { data: balanceData, isFetching } = useBalanceSummary(
    submitted && isValidInput ? accountId : undefined,
    submitted && isValidInput ? reportedBalance : undefined,
  )

  const summary = balanceData?.data

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidInput) return
    setSubmitted(true)
  }

  function handleReset() {
    setSubmitted(false)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bc-account">Conta bancária</Label>
            <Select
              id="bc-account"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value)
                setSubmitted(false)
              }}
              required
            >
              <option value="">Selecione uma conta</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bc-balance">Saldo real (informado pelo banco)</Label>
            <Input
              id="bc-balance"
              type="number"
              step="0.01"
              placeholder="0,00"
              value={reportedBalanceInput}
              onChange={(e) => {
                setReportedBalanceInput(e.target.value)
                setSubmitted(false)
              }}
              required
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={!isValidInput || isFetching}>
            {isFetching ? 'Verificando...' : 'Verificar saldo'}
          </Button>
          {submitted && (
            <Button type="button" variant="outline" onClick={handleReset}>
              Limpar
            </Button>
          )}
        </div>
      </form>

      {submitted && summary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {summary.isBalanced ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              {summary.isBalanced ? 'Saldo reconciliado' : 'Divergência encontrada'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Saldo calculado</span>
                <span className="font-mono text-lg font-semibold tabular-nums">
                  {formatCurrency(summary.calculatedBalance)}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Saldo informado</span>
                <span className="font-mono text-lg font-semibold tabular-nums">
                  {formatCurrency(summary.reportedBalance)}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Diferença</span>
                <span
                  className={cn(
                    'font-mono text-lg font-semibold tabular-nums',
                    summary.isBalanced
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {summary.difference >= 0 ? '+' : ''}
                  {formatCurrency(summary.difference)}
                </span>
              </div>
            </div>

            {summary.pendingItemsCount > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm text-amber-800 dark:text-amber-400">
                    {summary.pendingItemsCount} ite
                    {summary.pendingItemsCount !== 1 ? 'ns pendentes' : 'm pendente'} (
                    {formatCurrency(summary.pendingItemsAmount)})
                  </span>
                </div>
                {onViewPendingItems && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewPendingItems(accountId)}
                    className="text-xs"
                  >
                    Ver itens
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
