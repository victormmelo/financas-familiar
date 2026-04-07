'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMonthYearLabel } from '@/lib/utils'

export interface MonthNavigatorProps {
  year: number
  month: number
  canGoNext: boolean
  onPrev: () => void
  onNext: () => void
  onGoCurrent?: () => void
  showGoCurrent?: boolean
}

export function MonthNavigator({
  year,
  month,
  canGoNext,
  onPrev,
  onNext,
  onGoCurrent,
  showGoCurrent,
}: MonthNavigatorProps) {
  const label = formatMonthYearLabel(year, month)

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="group"
      aria-label={`Período: ${label}`}
    >
      <div className="flex items-center justify-center gap-1 sm:justify-start">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 border-border sm:h-9 sm:w-9"
          onClick={onPrev}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[12rem] text-center sm:min-w-[14rem]">
          <p className="text-sm font-medium capitalize tabular-nums text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">Período selecionado</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 border-border sm:h-9 sm:w-9"
          onClick={onNext}
          disabled={!canGoNext}
          aria-label="Próximo mês"
          aria-disabled={!canGoNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {showGoCurrent && onGoCurrent ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-border text-xs sm:self-center"
          onClick={onGoCurrent}
        >
          Mês atual
        </Button>
      ) : null}
    </div>
  )
}
