'use client'

import { useState } from 'react'
import { KeyRound, Plus, Copy, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/utils'
import {
  useMcpTokens,
  useCreateMcpToken,
  useRevokeMcpToken,
  useRevealMcpToken,
} from '@/hooks/use-mcp-tokens'

const createSchema = z.object({
  label: z.string().min(1, 'Nome obrigatório').max(100, 'Máximo 100 caracteres'),
})

type CreateForm = z.infer<typeof createSchema>

export default function McpTokensPage() {
  const { data: tokens, isLoading } = useMcpTokens()
  const createToken = useCreateMcpToken()
  const revokeToken = useRevokeMcpToken()
  const revealToken = useRevealMcpToken()
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { label: 'Cursor' },
  })

  async function onCreateSubmit(values: CreateForm) {
    try {
      const created = await createToken.mutateAsync({ label: values.label.trim() })
      setCreateOpen(false)
      reset({ label: 'Cursor' })
      setNewTokenValue(created.token)
      toast('Token criado', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao criar token', 'error')
    }
  }

  async function handleCopyExisting(id: string) {
    try {
      const token = await revealToken.mutateAsync(id)
      await navigator.clipboard.writeText(token)
      toast('Token copiado para a área de transferência', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao copiar', 'error')
    }
  }

  async function handleRevoke() {
    if (!revokeId) return
    try {
      await revokeToken.mutateAsync(revokeId)
      toast('Token revogado', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao revogar', 'error')
    } finally {
      setRevokeId(null)
    }
  }

  async function copyNewToken() {
    if (!newTokenValue) return
    try {
      await navigator.clipboard.writeText(newTokenValue)
      toast('Copiado', 'success')
    } catch {
      toast('Não foi possível copiar', 'error')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <KeyRound className="h-7 w-7 text-[#7CFC98]" />
          Tokens MCP
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gere tokens para conectar o Cursor (ou outro cliente MCP) ao servidor Finanças Familiar. O valor completo
          não fica visível na listagem; use copiar quando precisar.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Segurança</CardTitle>
          <CardDescription>
            Trate cada token como senha: quem possui pode acessar os dados da sua família via MCP. Revogue se vazar ou
            não usar mais.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-[#1E281E] text-[#7CFC98] border border-[#7CFC98]/40 hover:bg-[#253025]"
        >
          <Plus className="h-4 w-4 mr-2" />
          Gerar novo token
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Seus tokens</CardTitle>
          <CardDescription>Ativos — revogados somem da lista.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !tokens?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum token ainda. Gere um para começar.</p>
          ) : (
            <ul className="divide-y divide-border rounded-sm border border-border overflow-hidden">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between bg-[#111611]/50"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-foreground">{t.label}</p>
                    <p className="font-mono text-xs text-muted-foreground break-all">{t.tokenPreview}</p>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Criado {formatDate(t.createdAt)}
                      {t.lastUsedAt ? ` · Último uso ${formatDate(t.lastUsedAt)}` : ' · Nunca usado'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border"
                      disabled={revealToken.isPending}
                      onClick={() => void handleCopyExisting(t.id)}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copiar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-destructive/50 text-destructive hover:bg-destructive/10"
                      onClick={() => setRevokeId(t.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Revogar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        className="max-w-md"
        preventClose={isSubmitting || createToken.isPending}
      >
        <DialogHeader title="Novo token MCP" onClose={() => setCreateOpen(false)} />
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onCreateSubmit)}>
          <DialogBody className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Um nome ajuda a lembrar onde você usou (ex.: Cursor, notebook).
            </p>
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                placeholder="Cursor"
                className="font-mono text-sm"
                error={errors.label?.message}
                {...register('label')}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createToken.isPending || isSubmitting}
              className="bg-[#1E281E] text-[#7CFC98] border border-[#7CFC98]/40"
            >
              {createToken.isPending ? 'Gerando…' : 'Gerar token'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={!!newTokenValue} onClose={() => setNewTokenValue(null)} className="max-w-lg">
        <DialogHeader title="Guarde este token" onClose={() => setNewTokenValue(null)} />
        <DialogBody className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Copie agora para o <code className="text-xs bg-muted px-1 rounded">mcp.json</code> ou outro cliente. Se
            fechar sem copiar, use o botão <strong>Copiar</strong> na lista quando precisar do valor completo.
          </p>
          <Input readOnly value={newTokenValue ?? ''} className="font-mono text-xs h-auto py-2" />
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={() => void copyNewToken()} variant="secondary">
            <Copy className="h-4 w-4 mr-2" />
            Copiar token
          </Button>
          <Button type="button" onClick={() => setNewTokenValue(null)}>
            Concluí
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={revokeId !== null}
        onClose={() => setRevokeId(null)}
        title="Revogar token?"
        description="Clientes que usam este token deixarão de funcionar imediatamente."
        confirmLabel="Revogar"
        variant="destructive"
        isLoading={revokeToken.isPending}
        onConfirm={() => void handleRevoke()}
      />
    </div>
  )
}
