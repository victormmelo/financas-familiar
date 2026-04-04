'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  Wallet,
  Target,
  PieChart,
  FileText,
  RefreshCw,
  Receipt,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/transacoes', label: 'Transações', icon: Receipt },
  { href: '/app/contas', label: 'Contas', icon: Wallet },
  { href: '/app/cartoes', label: 'Cartões', icon: CreditCard },
  { href: '/app/transferencias', label: 'Transferências', icon: ArrowLeftRight },
  { href: '/app/metas', label: 'Metas', icon: Target },
  { href: '/app/orcamentos', label: 'Orçamentos', icon: PieChart },
  { href: '/app/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/app/reconciliacao', label: 'Reconciliação', icon: RefreshCw },
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
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-gray-200">
        <span className="text-xl font-bold text-blue-600">Finanças</span>
        <span className="text-xl font-bold text-gray-900">Familiar</span>
      </div>

      {/* Family */}
      {user && (
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Família</p>
          <p className="text-sm font-medium text-gray-900 truncate">{user.familyName ?? 'Minha Família'}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{user?.role === 'ADMIN' ? 'Administrador' : 'Membro'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}
