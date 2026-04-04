'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, CreditCard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CreditCardForm } from '@/components/forms/credit-card-form'
import {
  useCreditCards,
  useCreditCardInvoices,
  useDeleteCreditCard,
  usePayInvoice,
  type CreditCard as CreditCardType,
  type CreditCardInvoice,
} from '@/hooks/use-credit-cards'
import { useAccounts } from '@/hooks/use-accounts'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, getMonthName } from '@/lib/utils'

export default function CartoesPage() {
  const { data: cards, isLoading } = useCreditCards()
  const deleteCard = useDeleteCreditCard()
  const { toast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCardType | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteCard.mutateAsync(deleteId)
      toast('Cartão excluído', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao excluir', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Novo Cartão
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center py-10 text-gray-500">Carregando...</p>
      ) : cards?.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">Nenhum cartão cadastrado</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Adicionar cartão
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {cards?.map((card) => (
            <Card key={card.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-12 w-20 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow"
                      style={{ backgroundColor: card.color ?? '#6366f1' }}
                    >
                      {card.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{card.name}</p>
                      <p className="text-xs text-gray-500">
                        Fecha dia {card.closingDay} · Vence dia {card.dueDay}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Limite</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(card.limit)}</p>
                    {card.currentSpending !== undefined && (
                      <p className="text-xs text-gray-500">
                        Usado: {formatCurrency(card.currentSpending)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <button
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                      onClick={() => { setEditingCard(card); setShowForm(true) }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
                      onClick={() => setDeleteId(card.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                      onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
                    >
                      {expandedCard === card.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Limit bar */}
                {card.currentSpending !== undefined && (
                  <div className="mt-4">
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${Math.min((card.currentSpending / card.limit) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatCurrency(card.limit - (card.currentSpending ?? 0))} disponível
                    </p>
                  </div>
                )}

                {/* Invoices */}
                {expandedCard === card.id && <InvoiceList cardId={card.id} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreditCardForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingCard(undefined) }}
        card={editingCard}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Cartão"
        description="Todas as faturas deste cartão serão removidas. Deseja continuar?"
        isLoading={deleteCard.isPending}
      />
    </div>
  )
}

function InvoiceList({ cardId }: { cardId: string }) {
  const { data, isLoading } = useCreditCardInvoices(cardId)
  const payInvoice = usePayInvoice()
  const { data: accounts } = useAccounts()
  const { toast } = useToast()

  const [payDialog, setPayDialog] = useState<CreditCardInvoice | null>(null)
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')

  async function handlePay() {
    if (!payDialog || !accountId) return
    try {
      await payInvoice.mutateAsync({
        cardId,
        invoiceId: payDialog.id,
        accountId,
        amount: amount ? parseFloat(amount) : undefined,
      })
      toast('Fatura paga!', 'success')
      setPayDialog(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao pagar fatura', 'error')
    }
  }

  if (isLoading) return <p className="text-sm text-gray-400 mt-4 text-center">Carregando faturas...</p>

  const invoices = data?.data ?? []

  return (
    <div className="mt-4 border-t pt-4">
      <p className="text-sm font-medium text-gray-700 mb-3">Faturas</p>
      {invoices.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhuma fatura encontrada</p>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {getMonthName(inv.referenceMonth)} / {inv.referenceYear}
                </p>
                <p className="text-xs text-gray-500">{formatCurrency(inv.totalAmount)}</p>
              </div>
              <div className="flex items-center gap-2">
                <InvoiceStatusBadge status={inv.status} />
                {inv.status !== 'PAID' && (
                  <Button size="sm" variant="outline" onClick={() => setPayDialog(inv)}>
                    Pagar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!payDialog} onClose={() => setPayDialog(null)} className="max-w-sm">
        <DialogHeader title="Pagar Fatura" onClose={() => setPayDialog(null)} />
        <DialogBody className="space-y-4">
          <p className="text-sm text-gray-600">
            Total da fatura: <strong>{formatCurrency(payDialog?.totalAmount ?? 0)}</strong>
          </p>
          <div className="space-y-1.5">
            <Label>Conta para débito</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Selecione uma conta</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor (deixe em branco para total)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder={String(payDialog?.totalAmount ?? '')}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPayDialog(null)}>Cancelar</Button>
          <Button onClick={handlePay} isLoading={payInvoice.isPending} disabled={!accountId}>
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function InvoiceStatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return <Badge variant="success">Paga</Badge>
  if (status === 'CLOSED') return <Badge variant="warning">Fechada</Badge>
  return <Badge variant="default">Aberta</Badge>
}
