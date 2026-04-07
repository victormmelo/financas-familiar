'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'

const navItems = [
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
  { href: '/app/integracoes/mcp', label: 'Tokens MCP', icon: KeyRound },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, clearAuth } = useAuthStore()
  const router = useRouter()

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } finally {
      clearAuth()
      router.push('/auth/login')
    }
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-[#111611]">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-border">
        <span className="text-sm font-bold tracking-widest uppercase text-[#7CFC98]">
          Finanças
        </span>
        <span className="text-sm font-bold tracking-widest uppercase text-foreground">
          &nbsp;Familiar
        </span>
      </div>

      {/* Family */}
      {user && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Família</p>
          <p className="text-sm font-medium text-foreground truncate mt-0.5">
            {user.familyName ?? 'Minha Família'}
          </p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-[#1E281E] text-[#7CFC98] border-l-2 border-[#7CFC98] rounded-r-sm pl-[calc(0.75rem-2px)]'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground rounded-sm',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-sm bg-primary/20 flex items-center justify-center text-[#7CFC98] font-semibold text-sm border border-primary/30">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {user?.role === 'ADMIN' ? 'Admin' : 'Membro'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}
