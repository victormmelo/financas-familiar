'use client'

import { AppNavLinks, AppNavUserFooter, AppShellBrandRow, AppShellFamilyRow } from '@/components/layout/app-nav'

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r border-border bg-[#111611] md:flex md:flex-col">
      <AppShellBrandRow />
      <AppShellFamilyRow />
      <AppNavLinks className="min-h-0 flex-1 overflow-y-auto px-2 py-3" />
      <AppNavUserFooter />
    </aside>
  )
}
