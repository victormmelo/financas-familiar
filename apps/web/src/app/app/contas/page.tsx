'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Power } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Saldo total das contas ativas</p>
          <p className={`text-3xl font-bold ${totalBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatCurrency(totalBalance)}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Nova Conta
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center py-10 text-gray-500">Carregando...</p>
      ) : (
        <>
          {/* Active accounts */}
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

          {/* Inactive */}
          {inactive.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">Contas Inativas</h3>
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
              <CardContent className="py-16 text-center">
                <p className="text-gray-500 mb-4">Você ainda não tem contas cadastradas</p>
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
              style={{ backgroundColor: account.color ?? '#3b82f6' }}
            >
              {account.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{account.name}</p>
              <p className="text-xs text-gray-500">{getAccountTypeLabel(account.type)}</p>
            </div>
          </div>
          {!account.isActive && <Badge variant="secondary">Inativa</Badge>}
        </div>
        <p className={`text-2xl font-bold mb-4 ${account.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
          {formatCurrency(account.balance)}
        </p>
        <div className="flex items-center gap-1 justify-end border-t pt-3">
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" onClick={onEdit} title="Editar">
            <Pencil className="h-4 w-4" />
          </button>
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-yellow-600" onClick={onToggle} title={account.isActive ? 'Desativar' : 'Ativar'}>
            <Power className="h-4 w-4" />
          </button>
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500" onClick={onDelete} title="Excluir">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
