'use client'

import { useState } from 'react'
import { Plus, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TransferForm } from '@/components/forms/transfer-form'
import { useTransfers } from '@/hooks/use-transfers'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function TransferenciasPage() {
  const { data: transfers, isLoading } = useTransfers()
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Nova Transferência
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center py-10 text-gray-500">Carregando...</p>
          ) : !transfers || transfers.length === 0 ? (
            <p className="text-center py-12 text-gray-500">Nenhuma transferência registrada</p>
          ) : (
            <div className="divide-y">
              {transfers.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center">
                      <ArrowRight className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                        <span>{t.fromAccount?.name ?? '—'}</span>
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <span>{t.toAccount?.name ?? '—'}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatDate(t.date)}{t.description ? ` · ${t.description}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(t.amount)}
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
