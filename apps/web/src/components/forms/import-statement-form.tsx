'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useAccounts } from '@/hooks/use-accounts'
import { useImportStatement } from '@/hooks/use-reconciliation'
import { useToast } from '@/components/ui/toast'

interface Props {
  open: boolean
  onClose: () => void
}

export function ImportStatementForm({ open, onClose }: Props) {
  const { data: accounts } = useAccounts()
  const importStatement = useImportStatement()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [accountId, setAccountId] = useState('')
  const [fileName, setFileName] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setFileName(file?.name ?? '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!accountId) {
      toast('Selecione uma conta', 'error')
      return
    }
    if (!file) {
      toast('Selecione um arquivo', 'error')
      return
    }

    const formData = new FormData()
    formData.append('accountId', accountId)
    formData.append('file', file)

    importStatement.mutate(formData, {
      onSuccess: (result) => {
        const d = result.data
        toast(`${d.total} lançamentos importados · ${d.matched} correspondências encontradas`, 'success')
        setAccountId('')
        setFileName('')
        if (fileRef.current) fileRef.current.value = ''
        onClose()
      },
      onError: (err) => {
        toast(err.message ?? 'Erro ao importar', 'error')
      },
    })
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader title="Importar Extrato" onClose={onClose} />
        <DialogBody>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Formatos suportados: OFX e CSV</p>
            <div className="space-y-1.5">
              <Label htmlFor="import-account">Conta</Label>
              <Select
                id="import-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
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
              <Label htmlFor="import-file">Arquivo (.ofx ou .csv)</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  Escolher arquivo
                </Button>
                <span className="text-sm text-muted-foreground truncate max-w-48">
                  {fileName || 'Nenhum arquivo selecionado'}
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".ofx,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={importStatement.isPending}>
            {importStatement.isPending ? 'Importando...' : 'Importar'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
