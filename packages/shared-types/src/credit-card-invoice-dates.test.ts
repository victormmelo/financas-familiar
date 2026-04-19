import { describe, expect, it } from 'vitest'
import {
  calculateDueDateIso,
  closingInstantBeforeDue,
  dueDateUtc,
  dueInvoiceKeyForPurchaseDate,
  purchaseCycleBoundsUtc,
  purchaseCycleStartExclusiveUtc,
  shiftCalendarMonthUtc,
} from './credit-card-invoice-dates'

describe('credit-card-invoice-dates', () => {
  it('closingInstantBeforeDue — vencimento 02/05 fecha 25 → 25/04', () => {
    const c = closingInstantBeforeDue(2026, 5, 2, 25)
    expect(c.toISOString().slice(0, 10)).toBe('2026-04-25')
  })

  it('purchaseCycleBoundsUtc — fecha 25 vence 02', () => {
    const mayDue = purchaseCycleBoundsUtc(2026, 5, 25, 2)
    expect(mayDue.gt.toISOString().slice(0, 10)).toBe('2026-03-25')
    expect(mayDue.lte.toISOString().slice(0, 10)).toBe('2026-04-25')
  })

  it('dueInvoiceKeyForPurchaseDate — abril dentro do ciclo que vence em maio', () => {
    const purchase = new Date(Date.UTC(2026, 3, 18))
    const key = dueInvoiceKeyForPurchaseDate(purchase, 25, 2)
    expect(key.referenceMonth).toBe(5)
    expect(key.referenceYear).toBe(2026)
  })

  it('calculateDueDateIso usa mês de vencimento', () => {
    expect(calculateDueDateIso(5, 2026, 2)).toBe('2026-05-02')
  })

  it('dueDateUtc depois do fechamento', () => {
    const due = dueDateUtc(2026, 5, 2)
    const closing = closingInstantBeforeDue(2026, 5, 2, 25)
    expect(due.getTime()).toBeGreaterThan(closing.getTime())
  })

  it('shiftCalendarMonthUtc dezembro +1', () => {
    expect(shiftCalendarMonthUtc(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
  })

  it('purchaseCycleStartExclusiveUtc', () => {
    const start = purchaseCycleStartExclusiveUtc(2026, 5, 25, 2)
    expect(start.toISOString().slice(0, 10)).toBe('2026-03-26')
  })
})
