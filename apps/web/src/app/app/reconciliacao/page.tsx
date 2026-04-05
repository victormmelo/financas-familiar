'use client'

import { RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function ReconciliacaoPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Reconciliação Bancária
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 mb-6">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Em desenvolvimento</p>
            <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
              A integração com Open Finance (Pluggy) para importação automática de transações
              e reconciliação bancária está sendo implementada.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">O que estará disponível:</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">Planejado</Badge>
                  Conexão com bancos via Open Finance
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">Planejado</Badge>
                  Importação automática de transações
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">Planejado</Badge>
                  Matching automático com lançamentos manuais
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">Planejado</Badge>
                  Identificação de divergências
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">Planejado</Badge>
                  Confirmação em lote de transações importadas
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
