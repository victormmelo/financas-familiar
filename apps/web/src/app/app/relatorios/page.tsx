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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Relatórios são gerados de forma assíncrona</p>
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
            <p className="text-center py-10 text-gray-500">Carregando...</p>
          ) : reports.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">Nenhum relatório gerado</p>
              <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Gerar primeiro relatório</Button>
            </div>
          ) : (
            <div className="divide-y">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {REPORT_TYPES.find((t) => t.value === r.type)?.label ?? r.type}
                      </p>
                      <p className="text-xs text-gray-500">
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

      <Dialog open={showForm} onClose={() => setShowForm(false)} className="max-w-md">
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
