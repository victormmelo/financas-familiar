import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  max?: number
  className?: string
  barClassName?: string
}

/**
 * Barra de progresso simples. `value` e `max` definem a porcentagem (value/max*100).
 * Ou passe apenas `value` como porcentagem direta (0–100+).
 */
export function ProgressBar({ value, max, className, barClassName }: ProgressBarProps) {
  const percent = max !== undefined ? (value / max) * 100 : value
  const clamped = Math.min(percent, 100)

  return (
    <div className={cn('h-2 rounded-full bg-muted overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all', barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
