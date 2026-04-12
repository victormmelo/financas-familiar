'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  Wallet,
  Tags,
  Target,
  PieChart,
  FileText,
  RefreshCw,
  Receipt,
  LogOut,
  KeyRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'
import { useAuthStore } from '@/stores/auth.store'

export const APP_NAV_ITEMS: readonly { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/transacoes', label: 'Transações', icon: Receipt },
  { href: '/app/contas', label: 'Contas', icon: Wallet },
  { href: '/app/categorias', label: 'Categorias', icon: Tags },
  { href: '/app/cartoes', label: 'Cartões', icon: CreditCard },
  { href: '/app/transferencias', label: 'Transferências', icon: ArrowLeftRight },
  { href: '/app/metas', label: 'Metas', icon: Target },
  { href: '/app/orcamentos', label: 'Orçamentos', icon: PieChart },
  { href: '/app/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/app/reconciliacao', label: 'Reconciliação', icon: RefreshCw },
  { href: '/app/integracoes/mcp', label: 'Integrações MCP', icon: KeyRound },
]

export function AppShellBrandRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-16 items-center border-b border-border px-6', className)}>
      <span className="text-sm font-bold uppercase tracking-widest text-[#7CFC98]">Finanças</span>
      <span className="text-sm font-bold uppercase tracking-widest text-foreground">&nbsp;Familiar</span>
    </div>
  )
}

export function AppShellFamilyRow({ className }: { className?: string }) {
  const { user } = useAuthStore()
  if (!user) return null
  return (
    <div className={cn('border-b border-border px-4 py-3', className)}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Família</p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">
        {user.familyName ?? 'Minha Família'}
      </p>
    </div>
  )
}

export function AppNavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void
  className?: string
}) {
  const pathname = usePathname()
  return (
    <nav className={cn('flex flex-col space-y-0.5', className)} aria-label="Navegação principal">
      {APP_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            onClick={() => onNavigate?.()}
            className={cn(
              'flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'rounded-r-sm border-l-2 border-[#7CFC98] bg-[#1E281E] pl-[calc(0.75rem-2px)] text-[#7CFC98]'
                : 'rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function AppNavUserFooter({ onBeforeAction }: { onBeforeAction?: () => void }) {
  const { user, clearAuth } = useAuthStore()

  async function handleLogout() {
    onBeforeAction?.()
    clearAuth()
    await signOut({ callbackUrl: '/auth/login' })
  }

  return (
    <div className="border-t border-border p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-primary/20 text-sm font-semibold text-[#7CFC98]">
          {user?.name?.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {user?.role === 'ADMIN' ? 'Admin' : 'Membro'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void handleLogout()}
        className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden />
        Sair
      </button>
    </div>
  )
}
