'use client'

import { useState } from 'react'
import { Plus, Download, RefreshCw, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useReports, useCreateReport, type Report } from '@/hooks/use-reports'
import { useToast } from '@/components/ui/toast'
import { useQueryClient } from '@tanstack/react-query'

const REPORT_TYPES = [
  { value: 'DRE', label: 'DRE (Demonstração de Resultado)' },
  { value: 'CASH_FLOW', label: 'Fluxo de Caixa' },
  { value: 'PATRIMONY', label: 'Patrimônio' },
]

export default function RelatoriosPage() {
  const { data, isLoading } = useReports({ limit: 20 })
  const createReport = useCreateReport()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState('DRE')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  async function handleCreate() {
    try {
      await createReport.mutateAsync({
        type,
        params: {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      })
      toast('Relatório solicitado! Aguarde o processamento.', 'success')
      setShowForm(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao gerar relatório', 'error')
    }
  }

  const reports = data?.data ?? []

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Relatórios são gerados de forma assíncrona</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['reports'] })}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Gerar Relatório
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-6 py-4">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="rounded-full bg-muted p-4">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Nenhum relatório gerado</p>
                <p className="text-sm text-muted-foreground">Gere DREs, fluxos de caixa e análises patrimoniais</p>
              </div>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Gerar primeiro relatório
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {REPORT_TYPES.find((t) => t.value === r.type)?.label ?? r.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ReportStatusBadge status={r.status} />
                    {r.status === 'DONE' && r.fileUrl && (
                      <a href={r.fileUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline">
                          <Download className="h-4 w-4" /> Baixar
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        className="max-w-md"
        preventClose={createReport.isPending}
      >
        <DialogHeader title="Gerar Relatório" onClose={() => setShowForm(false)} />
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Data Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
          <Button onClick={handleCreate} isLoading={createReport.isPending}>Gerar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function ReportStatusBadge({ status }: { status: Report['status'] }) {
  if (status === 'DONE') return <Badge variant="success">Pronto</Badge>
  if (status === 'PROCESSING') return <Badge variant="default">Processando</Badge>
  if (status === 'FAILED') return <Badge variant="destructive">Erro</Badge>
  return <Badge variant="secondary">Aguardando</Badge>
}
