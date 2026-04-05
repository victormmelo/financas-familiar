'use client'

import { usePathname } from 'next/navigation'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/app/dashboard': { title: 'Dashboard', subtitle: 'Visão geral operacional' },
  '/app/transacoes': { title: 'Transações', subtitle: 'Monitoramento de lançamentos' },
  '/app/contas': { title: 'Contas', subtitle: 'Controle de contas e saldos' },
  '/app/cartoes': { title: 'Cartões de Crédito', subtitle: 'Faturas e limites' },
  '/app/transferencias': { title: 'Transferências', subtitle: 'Movimentações entre contas' },
  '/app/metas': { title: 'Metas Financeiras', subtitle: 'Acompanhamento de progresso' },
  '/app/orcamentos': { title: 'Orçamentos', subtitle: 'Controle de gastos por categoria' },
  '/app/relatorios': { title: 'Relatórios', subtitle: 'Análises e demonstrativos' },
  '/app/reconciliacao': { title: 'Reconciliação', subtitle: 'Integração Open Finance' },
}

export function Header() {
  const pathname = usePathname()
  const page = Object.entries(pageTitles).find(([key]) => pathname.startsWith(key))?.[1]

  return (
    <header className="flex h-16 items-center border-b border-border bg-[#111611] px-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground leading-none">
          {page?.title ?? ''}
        </h1>
        {page?.subtitle && (
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            {page.subtitle}
          </p>
        )}
      </div>
    </header>
  )
}
