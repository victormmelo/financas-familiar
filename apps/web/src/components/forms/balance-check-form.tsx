'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAccounts } from '@/hooks/use-accounts'
import { useBalanceSummary } from '@/hooks/use-reconciliation'
import { formatCurrency, cn } from '@/lib/utils'
import { MoneyBrlInput } from '@/components/forms/money-brl-input'
import { normalizeReaisForApi } from '@financas/shared-types'
import { CheckCircle, AlertTriangle, Receipt } from 'lucide-react'

const schema = z.object({
  accountId: z.string().min(1, 'Selecione uma conta'),
  reportedBalance: z.number({ invalid_type_error: 'Informe o saldo real' }),
})

type FormData = z.infer<typeof schema>

interface Props {
  onViewPendingItems?: (accountId: string) => void
}

export function BalanceCheckForm({ onViewPendingItems }: Props) {
  const { data: accounts } = useAccounts()
  const [queryParams, setQueryParams] = useState<{ accountId: string; reportedBalance: number } | null>(
    null,
  )

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { accountId: '' },
  })

  const { onChange: onAccountChange, ...accountRegister } = register('accountId')

  const { data: balanceData, isFetching } = useBalanceSummary(
    queryParams?.accountId,
    queryParams?.reportedBalance,
  )

  const summary = balanceData?.data

  function onSubmit(data: FormData) {
    setQueryParams({
      accountId: data.accountId,
      reportedBalance: normalizeReaisForApi(data.reportedBalance),
    })
  }

  function handleReset() {
    setQueryParams(null)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bc-account">Conta bancária</Label>
            <Select
              id="bc-account"
              error={errors.accountId?.message}
              {...accountRegister}
              onChange={(e) => {
                onAccountChange(e)
                setQueryParams(null)
              }}
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
            <Label htmlFor="bc-balance">Saldo informado pelo banco</Label>
            <Controller
              name="reportedBalance"
              control={control}
              render={({ field }) => (
                <MoneyBrlInput
                  id="bc-balance"
                  placeholder="0,00"
                  error={errors.reportedBalance?.message}
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v)
                    setQueryParams(null)
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  aria-describedby="bc-balance-hint"
                />
              )}
            />
            <p id="bc-balance-hint" className="sr-only">
              Saldo em reais (BRL), duas casas decimais.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={isFetching}>
            {isFetching ? 'Verificando...' : 'Verificar saldo'}
          </Button>
          {queryParams && (
            <Button type="button" variant="outline" onClick={handleReset}>
              Limpar
            </Button>
          )}
        </div>
      </form>

      {queryParams && summary && (
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
                    summary.isBalanced ? 'text-emerald-400' : 'text-rose-400',
                  )}
                >
                  {summary.difference >= 0 ? '+' : ''}
                  {formatCurrency(summary.difference)}
                </span>
              </div>
            </div>

            {summary.pendingItemsCount > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-amber-400" />
                  <span className="text-sm text-amber-200">
                    {summary.pendingItemsCount} ite
                    {summary.pendingItemsCount !== 1 ? 'ns pendentes' : 'm pendente'} (
                    {formatCurrency(summary.pendingItemsAmount)})
                  </span>
                </div>
                {onViewPendingItems && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewPendingItems(queryParams.accountId)}
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
