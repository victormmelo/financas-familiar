import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  return new Intl.DateTimeFormat('pt-BR').format(d)
}

export function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function currentMonth() {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

export function getAccountTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    CHECKING: 'Conta Corrente',
    SAVINGS: 'Poupança',
    JOINT: 'Conta Conjunta',
    INVESTMENT: 'Investimento',
    CASH: 'Dinheiro',
  }
  return labels[type] ?? type
}

export function getCategoryTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    INCOME: 'Receita',
    EXPENSE: 'Despesa',
    BOTH: 'Ambos',
  }
  return labels[type] ?? type
}

export function getMonthName(month: number): string {
  return new Date(2000, month - 1).toLocaleString('pt-BR', { month: 'long' })
}
