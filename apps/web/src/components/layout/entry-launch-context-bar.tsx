'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth.store'
import { usePatchEntryPreferences } from '@/hooks/use-patch-entry-preferences'
import { useAccounts } from '@/hooks/use-accounts'
import { useCreditCards } from '@/hooks/use-credit-cards'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { UserEntryPreferences } from '@financas/shared-types'

function hasAnyPreference(p: UserEntryPreferences | undefined): boolean {
  if (!p) return false
  return Boolean(p.accountId || p.creditCardId)
}

function summaryLine(p: UserEntryPreferences): string {
  const bits: string[] = []
  if (p.accountName) bits.push(p.accountName)
  if (p.creditCardName) bits.push(`Cartão: ${p.creditCardName}`)
  return bits.join(' · ')
}

export function EntryLaunchContextBar({ className }: { className?: string }) {
  const user = useAuthStore((s) => s.user)
  const { data: accounts } = useAccounts()
  const { data: cards } = useCreditCards()
  const patch = usePatchEntryPreferences()
  const { toast } = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [draftAccount, setDraftAccount] = useState('')
  const [draftCard, setDraftCard] = useState('')

  const prefs = user?.entryPreferences
  const activeAccounts = (accounts ?? []).filter((a) => a.isActive)
  const activeCards = (cards ?? []).filter((c) => c.isActive)

  function openEdit() {
    const p = useAuthStore.getState().user?.entryPreferences
    setDraftAccount(p?.accountId ?? '')
    setDraftCard(p?.creditCardId ?? '')
    setEditOpen(true)
  }

  async function handleSave() {
    try {
      await patch.mutateAsync({
        accountId: draftAccount === '' ? null : draftAccount,
        creditCardId: draftCard === '' ? null : draftCard,
        expenseSettlement: null,
      })
      toast('Contexto de lançamento salvo.', 'success')
      setEditOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar contexto', 'error')
    }
  }

  async function handleClear() {
    try {
      await patch.mutateAsync({
        accountId: null,
        creditCardId: null,
        expenseSettlement: null,
      })
      toast('Contexto removido.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao limpar contexto', 'error')
    }
  }

  if (!user) return null

  const filled = prefs && hasAnyPreference(prefs)

  return (
    <>
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2 rounded-sm border border-border border-l-2 border-l-[#6BA3E8] bg-card/80 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
          className,
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contexto de lançamento
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {filled && prefs ? (
              <>
                <Badge variant="secondary" className="max-w-full truncate font-normal">
                  Lançando em: {summaryLine(prefs)}
                </Badge>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                Nenhum contexto — conta e cartão começam vazios no novo lançamento.
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openEdit} disabled={patch.isPending}>
            {filled ? 'Trocar' : 'Definir'}
          </Button>
          {filled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void handleClear()}
              disabled={patch.isPending}
            >
              Limpar
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} preventClose={patch.isPending} size="md">
        <DialogHeader title="Contexto de lançamento" onClose={() => setEditOpen(false)} />
        <DialogBody className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Conta e cartão aqui pré-preenchem os campos ao criar uma transação. Para despesa na conta ou na fatura,
            use os botões <span className="font-medium text-foreground">Nova transação</span> ou{' '}
            <span className="font-medium text-foreground">No cartão</span> na página de transações.
          </p>
          <div className="space-y-1">
            <Label htmlFor="ctx-account">Conta (opcional)</Label>
            <Select
              id="ctx-account"
              className="h-10 w-full"
              value={draftAccount}
              onChange={(e) => setDraftAccount(e.target.value)}
            >
              <option value="">Nenhuma</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ctx-card">Cartão (opcional)</Label>
            <Select
              id="ctx-card"
              className="h-10 w-full"
              value={draftCard}
              onChange={(e) => setDraftCard(e.target.value)}
            >
              <option value="">Nenhum</option>
              {activeCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={patch.isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={patch.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}
