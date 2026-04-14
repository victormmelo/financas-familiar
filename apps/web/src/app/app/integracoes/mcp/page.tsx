'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, KeyRound, Plus, RefreshCcw, ShieldCheck, Ticket, Trash2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/utils'
import {
  useCreateIdentityIntegration,
  useExchangeIdentityClientCredentials,
  useIdentityIntegrations,
  useIdentityMetadata,
  useManagedIdentityClients,
  useRevokeIdentityIntegration,
  useRotateIntegrationSecret,
  useUpdateIdentityIntegration,
} from '@/hooks/use-identity-integrations'
import type { IdentityClientCredentialsToken } from '@financas/shared-types'

const createSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório').max(100, 'Máximo 100 caracteres'),
  description: z.string().max(280, 'Máximo 280 caracteres').optional(),
  role: z.enum(['ADMIN', 'MEMBER']),
})

type CreateForm = z.infer<typeof createSchema>

type SecretDialogState =
  | { title: string; clientId: string; clientSecret: string }
  | null

const tokenMintSchema = z.object({
  clientSecret: z.string().min(1, 'Informe o client secret'),
})

type TokenMintForm = z.infer<typeof tokenMintSchema>

type TokenMintDialogState = { clientId: string } | null

/** Só nesta aba do navegador; some ao fechar a aba. Não use em computador compartilhado. */
function clientSecretSessionKey(clientId: string): string {
  return `ff.identity.clientSecret:${clientId}`
}

function persistClientSecretInSession(clientId: string, secret: string, remember: boolean): void {
  if (typeof window === 'undefined') return
  const key = clientSecretSessionKey(clientId)
  if (remember) sessionStorage.setItem(key, secret)
  else sessionStorage.removeItem(key)
}

function StatusBadge({ status }: { status: 'ACTIVE' | 'INACTIVE' }) {
  return (
    <Badge
      className={
        status === 'ACTIVE'
          ? 'border-[#7CFC98]/40 bg-[#1E281E] text-[#7CFC98]'
          : 'border-amber-500/30 bg-amber-950/20 text-amber-300'
      }
    >
      {status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
    </Badge>
  )
}

export default function McpIntegrationsPage() {
  const { data: integrations, isLoading } = useIdentityIntegrations()
  const { data: metadata } = useIdentityMetadata()
  const { data: clients } = useManagedIdentityClients()
  const createIntegration = useCreateIdentityIntegration()
  const updateIntegration = useUpdateIdentityIntegration()
  const rotateSecret = useRotateIntegrationSecret()
  const revokeIntegration = useRevokeIdentityIntegration()
  const exchangeClientCredentials = useExchangeIdentityClientCredentials()
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [secretDialog, setSecretDialog] = useState<SecretDialogState>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [tokenMintDialog, setTokenMintDialog] = useState<TokenMintDialogState>(null)
  const [mintedToken, setMintedToken] = useState<IdentityClientCredentialsToken | null>(null)
  const [rememberClientSecretInTab, setRememberClientSecretInTab] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: 'Integração MCP', description: '', role: 'MEMBER' },
  })

  const {
    register: registerTokenMint,
    handleSubmit: handleSubmitTokenMint,
    reset: resetTokenMint,
    setValue: setTokenMintSecret,
    getValues: getTokenMintValues,
    formState: { errors: tokenMintErrors, isSubmitting: isTokenMintSubmitting },
  } = useForm<TokenMintForm>({
    resolver: zodResolver(tokenMintSchema),
    defaultValues: { clientSecret: '' },
  })

  const tokenMintClientId = tokenMintDialog?.clientId ?? null

  useEffect(() => {
    if (!tokenMintClientId || typeof window === 'undefined') return
    const stored = sessionStorage.getItem(clientSecretSessionKey(tokenMintClientId))
    resetTokenMint({ clientSecret: stored ?? '' })
    setRememberClientSecretInTab(Boolean(stored))
  }, [tokenMintClientId, resetTokenMint])

  function closeTokenMintDialog() {
    setTokenMintDialog(null)
    setMintedToken(null)
    setRememberClientSecretInTab(false)
    resetTokenMint({ clientSecret: '' })
  }

  function openTokenMintDialog(clientId: string) {
    setMintedToken(null)
    setTokenMintDialog({ clientId })
  }

  function forgetStoredClientSecret() {
    if (!tokenMintDialog || typeof window === 'undefined') return
    sessionStorage.removeItem(clientSecretSessionKey(tokenMintDialog.clientId))
    setRememberClientSecretInTab(false)
    setTokenMintSecret('clientSecret', '')
    toast('Secret removido desta aba', 'success')
  }

  async function onTokenMintSubmit(values: TokenMintForm) {
    if (!tokenMintDialog) return
    try {
      const data = await exchangeClientCredentials.mutateAsync({
        clientId: tokenMintDialog.clientId,
        clientSecret: values.clientSecret,
      })
      setMintedToken(data)
      persistClientSecretInSession(tokenMintDialog.clientId, values.clientSecret, rememberClientSecretInTab)
      toast('Access token obtido', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao gerar token', 'error')
    }
  }

  async function mintAnotherAccessToken() {
    if (!tokenMintDialog) return
    const clientSecret = getTokenMintValues('clientSecret')
    if (!clientSecret.trim()) {
      toast('Cole o client secret de novo ou marque “Lembrar nesta aba” e informe uma vez.', 'error')
      return
    }
    try {
      const data = await exchangeClientCredentials.mutateAsync({
        clientId: tokenMintDialog.clientId,
        clientSecret,
      })
      setMintedToken(data)
      persistClientSecretInSession(tokenMintDialog.clientId, clientSecret, rememberClientSecretInTab)
      toast('Novo access token obtido', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao gerar token', 'error')
    }
  }

  const baseClients = useMemo(
    () => clients?.filter((client) => client.kind !== 'integration') ?? [],
    [clients],
  )

  async function copy(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(success, 'success')
    } catch {
      toast('Não foi possível copiar', 'error')
    }
  }

  async function onCreateSubmit(values: CreateForm) {
    try {
      const result = await createIntegration.mutateAsync({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        role: values.role,
      })
      setCreateOpen(false)
      reset({ name: 'Integração MCP', description: '', role: 'MEMBER' })
      setSecretDialog({
        title: 'Guarde estas credenciais',
        clientId: result.clientId,
        clientSecret: result.clientSecret,
      })
      toast('Integração criada', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao criar integração', 'error')
    }
  }

  async function handleRotate(id: string) {
    try {
      const result = await rotateSecret.mutateAsync(id)
      setSecretDialog({
        title: 'Novo client secret gerado',
        clientId: result.clientId,
        clientSecret: result.clientSecret,
      })
      toast('Secret rotacionado', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao rotacionar secret', 'error')
    }
  }

  async function handleStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    try {
      await updateIntegration.mutateAsync({ id, input: { status } })
      toast(status === 'ACTIVE' ? 'Integração ativada' : 'Integração inativada', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao atualizar status', 'error')
    }
  }

  async function handleRevoke() {
    if (!revokeId) return
    try {
      await revokeIntegration.mutateAsync(revokeId)
      toast('Integração revogada', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao revogar integração', 'error')
    } finally {
      setRevokeId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <KeyRound className="h-7 w-7 text-[#7CFC98]" />
          Integrações MCP
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie clients OAuth/OIDC para uso humano ou server-to-server sem depender do console do Keycloak.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Metadados OIDC</CardTitle>
            <CardDescription>Esses endpoints alimentam clientes MCP e automações externas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!metadata ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                <div className="rounded-sm border border-border bg-[#111611]/50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Issuer</p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground">{metadata.issuer}</p>
                </div>
                <div className="rounded-sm border border-border bg-[#111611]/50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Token endpoint</p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground">{metadata.tokenEndpoint}</p>
                </div>
                <div className="rounded-sm border border-border bg-[#111611]/50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">MCP endpoint</p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground">{metadata.mcpEndpoint}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void copy(metadata.tokenEndpoint, 'Token endpoint copiado')}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copiar token endpoint
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copy(metadata.mcpEndpoint, 'MCP endpoint copiado')}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copiar MCP endpoint
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clients base</CardTitle>
            <CardDescription>Estrutura controlada pelo projeto e pelo bootstrap declarativo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!baseClients.length ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              baseClients.map((client) => (
                <div key={client.clientId} className="rounded-sm border border-border bg-[#111611]/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{client.name}</p>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{client.clientId}</p>
                    </div>
                    <StatusBadge status={client.status} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Segurança</CardTitle>
          <CardDescription>
            Client secrets são exibidos apenas na criação e na rotação. Trate-os como senha e armazene em local seguro.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#7CFC98]" />
          <p>
            Integrações pertencem a uma única família. O papel selecionado controla o que a integração consegue fazer no
            MCP dentro desse tenant.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="border border-[#7CFC98]/40 bg-[#1E281E] text-[#7CFC98] hover:bg-[#253025]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova integração
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Integrações técnicas</CardTitle>
          <CardDescription>Clients confidenciais criados pela sua UI para uso no MCP e em fluxos server-to-server.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !integrations?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma integração ainda. Crie a primeira para começar.</p>
          ) : (
            <ul className="overflow-hidden rounded-sm border border-border divide-y divide-border">
              {integrations.map((integration) => (
                <li
                  key={integration.id}
                  className="flex flex-col gap-4 bg-[#111611]/50 p-4 xl:flex-row xl:items-center xl:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{integration.name}</p>
                      <StatusBadge status={integration.status} />
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {integration.role}
                      </Badge>
                    </div>
                    {integration.description ? <p className="text-sm text-muted-foreground">{integration.description}</p> : null}
                    <p className="break-all font-mono text-xs text-muted-foreground">{integration.keycloakClientId}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Criada {formatDate(integration.createdAt)}
                      {integration.lastUsedAt ? ` · Último uso ${formatDate(integration.lastUsedAt)}` : ' · Nunca usada'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border"
                      onClick={() => void copy(integration.keycloakClientId, 'Client ID copiado')}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Client ID
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border"
                      disabled={integration.status !== 'ACTIVE' || exchangeClientCredentials.isPending}
                      title={
                        integration.status !== 'ACTIVE'
                          ? 'Ative a integração para solicitar um access token'
                          : 'OAuth2 client_credentials no Keycloak'
                      }
                      onClick={() => openTokenMintDialog(integration.keycloakClientId)}
                    >
                      <Ticket className="mr-1.5 h-3.5 w-3.5" />
                      Gerar token
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border"
                      disabled={rotateSecret.isPending}
                      onClick={() => void handleRotate(integration.id)}
                    >
                      <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                      Rotacionar secret
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border"
                      disabled={updateIntegration.isPending}
                      onClick={() => void handleStatus(integration.id, integration.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
                    >
                      {integration.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-destructive/50 text-destructive hover:bg-destructive/10"
                      onClick={() => setRevokeId(integration.id)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
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
        preventClose={isSubmitting || createIntegration.isPending}
      >
        <DialogHeader title="Nova integração MCP" onClose={() => setCreateOpen(false)} />
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onCreateSubmit)}>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="ERP da família" error={errors.name?.message} {...register('name')} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input placeholder="Sincronização server-to-server" error={errors.description?.message} {...register('description')} />
            </div>
            <div className="space-y-1.5">
              <Label>Papel da integração</Label>
              <select
                className="flex h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
                {...register('role')}
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createIntegration.isPending || isSubmitting}
              className="border border-[#7CFC98]/40 bg-[#1E281E] text-[#7CFC98]"
            >
              {createIntegration.isPending ? 'Criando…' : 'Criar integração'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={secretDialog !== null} onClose={() => setSecretDialog(null)} className="max-w-lg">
        <DialogHeader title={secretDialog?.title ?? 'Credenciais'} onClose={() => setSecretDialog(null)} />
        <DialogBody className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Copie agora. O segredo não volta a aparecer na listagem por segurança.
          </p>
          <div className="space-y-1.5">
            <Label>Client ID</Label>
            <Input readOnly value={secretDialog?.clientId ?? ''} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Client secret</Label>
            <Input readOnly value={secretDialog?.clientSecret ?? ''} className="font-mono text-sm" />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => void copy(`${secretDialog?.clientId ?? ''}\n${secretDialog?.clientSecret ?? ''}`, 'Credenciais copiadas')}
            className="border border-[#7CFC98]/40 bg-[#1E281E] text-[#7CFC98]"
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copiar credenciais
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={revokeId !== null}
        onClose={() => setRevokeId(null)}
        title="Revogar integração?"
        description="O client será desativado imediatamente no Keycloak e deixará de autenticar no MCP."
        confirmLabel="Revogar"
        cancelLabel="Cancelar"
        onConfirm={() => void handleRevoke()}
        variant="destructive"
      />

      <Dialog
        open={tokenMintDialog !== null}
        onClose={closeTokenMintDialog}
        className="max-w-lg"
        preventClose={exchangeClientCredentials.isPending || isTokenMintSubmitting}
      >
        <DialogHeader title="Gerar access token" onClose={closeTokenMintDialog} />
        {!mintedToken ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmitTokenMint(onTokenMintSubmit)}>
            <DialogBody className="space-y-4">
              <p className="text-sm text-muted-foreground">
                O servidor não grava o secret. Para renovar token várias vezes (ex.: Cursor, token curto), você pode
                marcar a opção abaixo: o secret fica só no <span className="font-mono text-xs">sessionStorage</span>{' '}
                desta aba até você fechar o navegador ou clicar em esquecer.
              </p>
              <div className="space-y-1.5">
                <Label>Client ID</Label>
                <Input readOnly value={tokenMintDialog?.clientId ?? ''} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-token-client-secret">Client secret</Label>
                <Input
                  id="mcp-token-client-secret"
                  type="password"
                  autoComplete="off"
                  placeholder="Cole o secret mostrado na criação ou após rotação"
                  error={tokenMintErrors.clientSecret?.message}
                  {...registerTokenMint('clientSecret')}
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border border-input accent-[#7CFC98]"
                  checked={rememberClientSecretInTab}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setRememberClientSecretInTab(checked)
                    if (!checked && tokenMintDialog && typeof window !== 'undefined') {
                      sessionStorage.removeItem(clientSecretSessionKey(tokenMintDialog.clientId))
                    }
                  }}
                />
                <span>
                  Lembrar client secret nesta aba (renovar token sem colar de novo até fechar a aba). Evite em PC
                  compartilhado; extensões maliciosas poderiam ler o armazenamento da sessão.
                </span>
              </label>
              <div>
                <Button type="button" variant="ghost" size="sm" className="h-auto px-0 text-xs text-muted-foreground" onClick={forgetStoredClientSecret}>
                  Esquecer secret nesta aba
                </Button>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeTokenMintDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={exchangeClientCredentials.isPending || isTokenMintSubmitting}
                className="border border-[#7CFC98]/40 bg-[#1E281E] text-[#7CFC98]"
              >
                {exchangeClientCredentials.isPending ? 'Solicitando…' : 'Gerar token'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogBody className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Use no header <span className="font-mono text-xs">Authorization: Bearer …</span> ao chamar o MCP.
                {mintedToken.expiresIn > 0 ? (
                  <>
                    {' '}
                    Validade aproximada: <span className="font-mono">{mintedToken.expiresIn}s</span>.
                  </>
                ) : null}
              </p>
              <div className="space-y-1.5">
                <Label>Access token</Label>
                <textarea
                  readOnly
                  className="min-h-[140px] w-full resize-y rounded-sm border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
                  value={mintedToken.accessToken}
                />
              </div>
              <p className="text-xs text-muted-foreground">Tipo: {mintedToken.tokenType}</p>
            </DialogBody>
            <DialogFooter>
              <div className="flex w-full flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={exchangeClientCredentials.isPending}
                  onClick={() => void mintAnotherAccessToken()}
                >
                  <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                  {exchangeClientCredentials.isPending ? 'Gerando…' : 'Gerar outro token'}
                </Button>
                <Button type="button" variant="outline" onClick={() => void copy(mintedToken.accessToken, 'Token copiado')}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copiar token
                </Button>
                <Button type="button" onClick={closeTokenMintDialog}>
                  Fechar
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </div>
  )
}
