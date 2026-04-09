'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  AppNavLinks,
  AppNavUserFooter,
  AppShellBrandRow,
  AppShellFamilyRow,
} from '@/components/layout/app-nav'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/app/dashboard': { title: 'Dashboard', subtitle: 'Visão geral operacional' },
  '/app/transacoes': { title: 'Transações', subtitle: 'Monitoramento de lançamentos' },
  '/app/contas-fixas': { title: 'Contas Fixas', subtitle: 'Recorrências automáticas' },
  '/app/contas': { title: 'Contas', subtitle: 'Controle de contas e saldos' },
  '/app/categorias': { title: 'Categorias', subtitle: 'Classificação de receitas e despesas' },
  '/app/cartoes': { title: 'Cartões de Crédito', subtitle: 'Faturas e limites' },
  '/app/transferencias': { title: 'Transferências', subtitle: 'Movimentações entre contas' },
  '/app/metas': { title: 'Metas Financeiras', subtitle: 'Acompanhamento de progresso' },
  '/app/orcamentos': { title: 'Orçamentos', subtitle: 'Controle de gastos por categoria' },
  '/app/relatorios': { title: 'Relatórios', subtitle: 'Análises e demonstrativos' },
  '/app/reconciliacao': { title: 'Reconciliação', subtitle: 'Integração Open Finance' },
  '/app/integracoes/mcp': { title: 'Tokens MCP', subtitle: 'Integrações e acesso' },
}

export function Header() {
  const pathname = usePathname()
  const page = Object.entries(pageTitles).find(([key]) => pathname.startsWith(key))?.[1]
  const [navOpen, setNavOpen] = useState(false)

  const closeNav = () => setNavOpen(false)

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-[#111611] px-4 sm:px-6">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 border-border md:hidden"
          aria-label="Abrir menu"
          onClick={() => setNavOpen(true)}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-none tracking-tight text-foreground sm:text-xl">
            {page?.title ?? ''}
          </h1>
          {page?.subtitle ? (
            <p className="mt-0.5 truncate text-[10px] uppercase tracking-widest text-muted-foreground">
              {page.subtitle}
            </p>
          ) : null}
        </div>
      </header>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          className="max-h-full min-h-0 overflow-hidden border-border bg-[#111611] p-0 text-foreground"
          showCloseButton
        >
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <AppShellBrandRow className="pr-14" />
          <AppShellFamilyRow />
          <AppNavLinks
            className="min-h-0 flex-1 overflow-y-auto px-2 py-3"
            onNavigate={closeNav}
          />
          <AppNavUserFooter onBeforeAction={closeNav} />
        </SheetContent>
      </Sheet>
    </>
  )
}
