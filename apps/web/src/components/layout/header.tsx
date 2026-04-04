'use client'

import { usePathname } from 'next/navigation'

const pageTitles: Record<string, string> = {
  '/app/dashboard': 'Dashboard',
  '/app/transacoes': 'Transações',
  '/app/contas': 'Contas',
  '/app/cartoes': 'Cartões de Crédito',
  '/app/transferencias': 'Transferências',
  '/app/metas': 'Metas Financeiras',
  '/app/orcamentos': 'Orçamentos',
  '/app/relatorios': 'Relatórios',
  '/app/reconciliacao': 'Reconciliação',
}

export function Header() {
  const pathname = usePathname()
  const title = Object.entries(pageTitles).find(([key]) => pathname.startsWith(key))?.[1] ?? ''

  return (
    <header className="flex h-16 items-center border-b border-gray-200 bg-white px-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
    </header>
  )
}
