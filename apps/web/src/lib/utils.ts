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

/** Apenas data calendário YYYY-MM-DD (sem hora/timezone na string). */
const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function formatDate(date: string | Date): string {
  const d =
    typeof date === 'string'
      ? (() => {
          const s = date.trim()
          if (!s) return new Date(NaN)
          return PLAIN_DATE_RE.test(s) ? new Date(`${s}T00:00:00`) : new Date(s)
        })()
      : date
  if (Number.isNaN(d.getTime())) {
    return '—'
  }
  return new Intl.DateTimeFormat('pt-BR').format(d)
}

export function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function currentMonth() {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

/** Último dia do mês (month 1–12), para intervalos YYYY-MM-DD inclusivos. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
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

/** Rótulo legível: "abril de 2026". */
export function formatMonthYearLabel(year: number, month1to12: number): string {
  return `${getMonthName(month1to12)} de ${year}`
}

export function shiftCalendarMonth(
  year: number,
  month1to12: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month1to12 - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function compareYearMonth(
  a: { year: number; month: number },
  b: { year: number; month: number },
): number {
  if (a.year !== b.year) return a.year - b.year
  return a.month - b.month
}

/** Impede selecionar mês após `max` (tipicamente mês atual). */
export function clampYearMonthNotAfter(
  year: number,
  month1to12: number,
  max: { year: number; month: number },
): { year: number; month: number } {
  if (compareYearMonth({ year, month: month1to12 }, max) > 0) return max
  return { year, month: month1to12 }
}

/** Query `ano` / `mes` do dashboard (?ano=2026&mes=4). */
export function parseDashboardMonthParams(
  ano: string | null | undefined,
  mes: string | null | undefined,
): { year: number; month: number } | null {
  if (ano == null || mes == null || ano === '' || mes === '') return null
  const year = Number.parseInt(ano, 10)
  const month = Number.parseInt(mes, 10)
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12 ||
    year < 2000 ||
    year > 2100
  ) {
    return null
  }
  return { year, month }
}
