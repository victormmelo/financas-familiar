'use client'

import { useState } from 'react'
import { Plus, ArrowRight, ArrowLeftRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TransferForm } from '@/components/forms/transfer-form'
import { useTransfers } from '@/hooks/use-transfers'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function TransferenciasPage() {
  const { data: transfers, isLoading } = useTransfers()
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Nova Transferência
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : !transfers || transfers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="rounded-full bg-muted p-4">
                <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Nenhuma transferência registrada</p>
                <p className="text-sm text-muted-foreground">Movimente valores entre suas contas</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Nova transferência
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transfers.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                      <ArrowRight className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span>{t.fromAccount?.name ?? '—'}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span>{t.toAccount?.name ?? '—'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.date)}{t.description ? ` · ${t.description}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-sky-600 dark:text-sky-400">
                    ↔ {formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TransferForm open={showForm} onClose={() => setShowForm(false)} />
    </div>
  )
}
