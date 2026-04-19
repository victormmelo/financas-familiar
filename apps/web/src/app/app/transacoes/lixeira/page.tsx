'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useTransactions,
  useRestoreTransaction,
  usePermanentlyDeleteTransaction,
  useEmptyTransactionTrash,
  type Transaction,
} from '@/hooks/use-transactions'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatCalendarDate, cn } from '@/lib/utils'

export default function TransacoesLixeiraPage() {
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const limit = 20
  const { data, isLoading } = useTransactions({ status: 'DELETED', page, limit })
  const restore = useRestoreTransaction()
  const permanent = usePermanentlyDeleteTransaction()
  const emptyTrash = useEmptyTransactionTrash()

  const [permanentId, setPermanentId] = useState<string | null>(null)
  const [emptyOpen, setEmptyOpen] = useState(false)

  const transactions = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  async function handleRestore(id: string) {
    try {
      await restore.mutateAsync(id)
      toast('Transação restaurada.', 'success')
    } catch {
      toast('Erro ao restaurar', 'error')
    }
  }

  async function handlePermanent() {
    if (!permanentId) return
    try {
      await permanent.mutateAsync(permanentId)
      toast('Transação removida definitivamente.', 'success')
    } catch {
      toast('Erro ao apagar', 'error')
    } finally {
      setPermanentId(null)
    }
  }

  async function handleEmptyTrash() {
    try {
      const r = await emptyTrash.mutateAsync()
      toast(
        r.deleted === 0
          ? 'A lixeira já estava vazia.'
          : r.deleted === 1
            ? '1 transação removida definitivamente.'
            : `${r.deleted} transações removidas definitivamente.`,
        'success',
      )
    } catch {
      toast('Erro ao esvaziar a lixeira', 'error')
    } finally {
      setEmptyOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 py-4 sm:gap-8 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/app/transacoes"
          className="inline-flex w-fit items-center gap-2 rounded-sm px-0 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Voltar às transações
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle className="text-base font-semibold tracking-tight">Lixeira</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Itens excluídos não entram na lista principal. Restaure ou apague definitivamente — esta última ação
              não pode ser desfeita.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full rounded-sm sm:w-auto"
            disabled={transactions.length === 0 && !isLoading}
            onClick={() => setEmptyOpen(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Esvaziar lixeira
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4">
                  <Skeleton className="h-4 w-24" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm font-medium text-foreground">Lixeira vazia</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                As transações que você enviar para a lixeira aparecerão aqui até serem restauradas ou removidas
                definitivamente.
              </p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden">
                {transactions.map((t) => (
                  <TrashRow
                    key={t.id}
                    t={t}
                    actionsDisabled={restore.isPending || permanent.isPending}
                    restoreLoading={restore.isPending}
                    onRestore={() => void handleRestore(t.id)}
                    onPermanent={() => setPermanentId(t.id)}
                  />
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Conta</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map((t) => (
                      <tr key={t.id} className="transition-colors hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-3 text-secondary-foreground">{formatCalendarDate(t.date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{t.description}</p>
                          {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                        </td>
                        <td className="px-4 py-3 text-secondary-foreground">{t.account?.name ?? '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <TrashAmount t={t} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-sm"
                              isLoading={restore.isPending}
                              disabled={restore.isPending || permanent.isPending}
                              onClick={() => void handleRestore(t.id)}
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden />
                              Restaurar
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="rounded-sm"
                              disabled={restore.isPending || permanent.isPending}
                              onClick={() => setPermanentId(t.id)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                              Apagar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
          <Button
            variant="outline"
            className="min-h-10 w-full rounded-sm sm:w-auto"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="flex flex-col items-center justify-center gap-0.5 text-center text-xs text-muted-foreground tabular-nums sm:text-sm">
            <span>Página {page}</span>
            <span className="text-muted-foreground/80">de {totalPages}</span>
          </span>
          <Button
            variant="outline"
            className="min-h-10 w-full rounded-sm sm:w-auto"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!permanentId}
        onClose={() => setPermanentId(null)}
        onConfirm={() => void handlePermanent()}
        title="Remover definitivamente"
        description="Esta transação será apagada do banco de dados. Não será possível recuperá-la."
        isLoading={permanent.isPending}
        confirmLabel="Remover para sempre"
      />

      <ConfirmDialog
        open={emptyOpen}
        onClose={() => setEmptyOpen(false)}
        onConfirm={() => void handleEmptyTrash()}
        title="Esvaziar lixeira"
        description="Todas as transações na lixeira serão removidas definitivamente. Esta ação não pode ser desfeita."
        isLoading={emptyTrash.isPending}
        confirmLabel="Esvaziar tudo"
      />
    </div>
  )
}

function TrashAmount({ t }: { t: Transaction }) {
  return (
    <span
      className={cn(
        'font-mono text-sm font-semibold tabular-nums',
        t.type === 'INCOME' ? 'text-emerald-400' : 'text-rose-400',
      )}
    >
      {t.type === 'INCOME' ? '+' : '-'}
      {formatCurrency(t.amount)}
    </span>
  )
}

function TrashRow({
  t,
  actionsDisabled,
  restoreLoading,
  onRestore,
  onPermanent,
}: {
  t: Transaction
  actionsDisabled: boolean
  restoreLoading: boolean
  onRestore: () => void
  onPermanent: () => void
}) {
  return (
    <li className="p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="whitespace-nowrap font-mono text-sm tabular-nums text-secondary-foreground">
            {formatCalendarDate(t.date)}
          </span>
          <TrashAmount t={t} />
        </div>
        <div>
          <p className="font-medium text-foreground">{t.description}</p>
          {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
        </div>
        <dl className="grid gap-1 text-xs text-secondary-foreground">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Conta</dt>
            <dd>{t.account?.name ?? '—'}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">Excluído</Badge>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-sm"
            isLoading={restoreLoading}
            disabled={actionsDisabled}
            onClick={onRestore}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Restaurar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="rounded-sm"
            disabled={actionsDisabled}
            onClick={onPermanent}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Apagar para sempre
          </Button>
        </div>
      </div>
    </li>
  )
}
