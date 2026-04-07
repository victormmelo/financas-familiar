'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Power, Wallet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { AccountForm } from '@/components/forms/account-form'
import { useAccounts, useDeleteAccount, useUpdateAccount, type Account } from '@/hooks/use-accounts'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, getAccountTypeLabel } from '@/lib/utils'

export default function ContasPage() {
  const { data: accounts, isLoading } = useAccounts()
  const deleteAccount = useDeleteAccount()
  const updateAccount = useUpdateAccount()
  const { toast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteAccount.mutateAsync(deleteId)
      toast('Conta excluída', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao excluir', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  async function toggleActive(account: Account) {
    try {
      await updateAccount.mutateAsync({ id: account.id, isActive: !account.isActive })
      toast(account.isActive ? 'Conta desativada' : 'Conta ativada', 'success')
    } catch {
      toast('Erro ao atualizar conta', 'error')
    }
  }

  const active = accounts?.filter((a) => a.isActive) ?? []
  const inactive = accounts?.filter((a) => !a.isActive) ?? []
  const totalBalance = active.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Saldo total das contas ativas</span>
          <span className={`font-mono text-3xl font-semibold tabular-nums ${totalBalance >= 0 ? 'text-foreground' : 'text-rose-400'}`}>
            {formatCurrency(totalBalance)}
          </span>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Nova Conta
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-8 w-32 mb-4" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Active accounts */}
          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={() => { setEditingAccount(account); setShowForm(true) }}
                  onDelete={() => setDeleteId(account.id)}
                  onToggle={() => toggleActive(account)}
                />
              ))}
            </div>
          )}

          {/* Inactive */}
          {inactive.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium text-muted-foreground">Contas Inativas</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {inactive.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onEdit={() => { setEditingAccount(account); setShowForm(true) }}
                    onDelete={() => setDeleteId(account.id)}
                    onToggle={() => toggleActive(account)}
                  />
                ))}
              </div>
            </div>
          )}

          {accounts?.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="rounded-full bg-muted p-4">
                  <Wallet className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Nenhuma conta cadastrada</p>
                  <p className="text-sm text-muted-foreground">Adicione sua primeira conta bancária</p>
                </div>
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4" /> Criar primeira conta
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <AccountForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingAccount(undefined) }}
        account={editingAccount}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Conta"
        description="Todas as transações desta conta serão afetadas. Deseja continuar?"
        isLoading={deleteAccount.isPending}
      />
    </div>
  )
}

function AccountCard({
  account,
  onEdit,
  onDelete,
  onToggle,
}: {
  account: Account
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  return (
    <Card className={account.isActive ? '' : 'opacity-60'}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: account.color ?? '#6366f1' }}
            >
              {account.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-foreground">{account.name}</p>
              <p className="text-xs text-muted-foreground">{getAccountTypeLabel(account.type)}</p>
            </div>
          </div>
          {!account.isActive && <Badge variant="secondary">Inativa</Badge>}
        </div>
        <p className={`font-mono text-2xl font-semibold tabular-nums mb-4 ${account.balance >= 0 ? 'text-foreground' : 'text-rose-400'}`}>
          {formatCurrency(account.balance)}
        </p>
        <div className="flex items-center gap-1 justify-end border-t border-border pt-3">
          <button className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground" onClick={onEdit} title="Editar">
            <Pencil className="h-4 w-4" />
          </button>
          <button className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-amber-600" onClick={onToggle} title={account.isActive ? 'Desativar' : 'Ativar'}>
            <Power className="h-4 w-4" />
          </button>
          <button className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-rose-600" onClick={onDelete} title="Excluir">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
