/**
 * Regras de domínio: `referenceMonth`/`referenceYear` na fatura = mês/ano do VENCIMENTO.
 * Fechamento oficial = último dia igual a `closingDay` (clamp ao mês) estritamente anterior ao vencimento.
 * Ciclo de compras: (closingAnterior, closingAtual] em datas UTC (meia-noite).
 */

/** Desloca mês civil (1–12) no calendário UTC. */
export function shiftCalendarMonthUtc(
  year: number,
  month1to12: number,
  deltaMonths: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month1to12 - 1 + deltaMonths, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

export function daysInMonthUtc(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

/** Garante que `day` existe no mês (ex.: 31 em abril → 30). */
export function clampDayInMonthUtc(year: number, month1to12: number, day: number): number {
  const dim = daysInMonthUtc(year, month1to12)
  return Math.min(Math.max(1, day), dim)
}

function utcMidnight(year: number, month1to12: number, day: number): Date {
  const d = clampDayInMonthUtc(year, month1to12, day)
  return new Date(Date.UTC(year, month1to12 - 1, d))
}

/**
 * Data de vencimento da fatura (UTC meia-noite), conforme mês de referência = vencimento.
 */
export function dueDateUtc(referenceYear: number, referenceMonth: number, dueDay: number): Date {
  const d = clampDayInMonthUtc(referenceYear, referenceMonth, dueDay)
  return new Date(Date.UTC(referenceYear, referenceMonth - 1, d))
}

export function calculateDueDateIso(
  referenceMonth: number,
  referenceYear: number,
  dueDay: number,
): string {
  const d = clampDayInMonthUtc(referenceYear, referenceMonth, dueDay)
  return `${referenceYear}-${String(referenceMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Última data com dia `closingDay` (limitada ao fim do mês) estritamente anterior ao vencimento.
 */
export function closingInstantBeforeDue(
  dueYear: number,
  dueMonth: number,
  dueDay: number,
  closingDay: number,
): Date {
  const due = dueDateUtc(dueYear, dueMonth, dueDay)
  let y = dueYear
  let m = dueMonth

  for (let guard = 0; guard < 48; guard++) {
    const dim = daysInMonthUtc(y, m)
    const dayClamped = Math.min(closingDay, dim)
    const candidate = new Date(Date.UTC(y, m - 1, dayClamped))
    if (candidate.getTime() < due.getTime()) {
      return candidate
    }
    const prev = shiftCalendarMonthUtc(y, m, -1)
    y = prev.year
    m = prev.month
  }

  throw new Error('closingInstantBeforeDue: não foi possível determinar o fechamento')
}

export interface PurchaseCycleBounds {
  /** Exclusivo: compras com data > gt */
  gt: Date
  /** Inclusivo: compras com data <= lte */
  lte: Date
}

/**
 * Intervalo de datas de compra (campo `date` da transação) para a fatura com vencimento (referenceYear, referenceMonth).
 */
export function purchaseCycleBoundsUtc(
  referenceYear: number,
  referenceMonth: number,
  closingDay: number,
  dueDay: number,
): PurchaseCycleBounds {
  const prev = shiftCalendarMonthUtc(referenceYear, referenceMonth, -1)
  const prevDueDay = clampDayInMonthUtc(prev.year, prev.month, dueDay)
  const closingAnterior = closingInstantBeforeDue(prev.year, prev.month, prevDueDay, closingDay)
  const dueDayClamped = clampDayInMonthUtc(referenceYear, referenceMonth, dueDay)
  const closingAtual = closingInstantBeforeDue(referenceYear, referenceMonth, dueDayClamped, closingDay)
  return { gt: closingAnterior, lte: closingAtual }
}

/**
 * Qual fatura (mês/ano de vencimento) contém a data da compra.
 */
export function dueInvoiceKeyForPurchaseDate(
  purchaseDate: Date,
  closingDay: number,
  dueDay: number,
): { referenceYear: number; referenceMonth: number } {
  const y = purchaseDate.getUTCFullYear()
  const m = purchaseDate.getUTCMonth() + 1
  const d = purchaseDate.getUTCDate()
  const anchor = utcMidnight(y, m, d)

  for (let delta = -36; delta <= 36; delta++) {
    const cand = shiftCalendarMonthUtc(y, m, delta)
    const { gt, lte } = purchaseCycleBoundsUtc(cand.year, cand.month, closingDay, dueDay)
    if (anchor.getTime() > gt.getTime() && anchor.getTime() <= lte.getTime()) {
      return { referenceYear: cand.year, referenceMonth: cand.month }
    }
  }

  throw new Error('dueInvoiceKeyForPurchaseDate: data fora da janela de faturas suportada')
}

/** Início do período de compras (dia seguinte ao fechamento anterior), para exibição. */
export function purchaseCycleStartExclusiveUtc(
  referenceYear: number,
  referenceMonth: number,
  closingDay: number,
  dueDay: number,
): Date {
  const { gt } = purchaseCycleBoundsUtc(referenceYear, referenceMonth, closingDay, dueDay)
  const t = gt.getTime() + 24 * 60 * 60 * 1000
  return new Date(t)
}
