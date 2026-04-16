import { describe, expect, it } from 'vitest'
import { getAppCalendarTimeZone, parsePlainDate } from './plain-date'

describe('parsePlainDate', () => {
  it('interpreta YYYY-MM-DD em America/Sao_Paulo como meia-noite local (UTC-3)', () => {
    const d = parsePlainDate('2026-04-16', 'America/Sao_Paulo')
    expect(d.toISOString()).toBe('2026-04-16T03:00:00.000Z')
  })

  it('inclui o último dia do intervalo quando start e end são o mesmo YYYY-MM-DD (São Paulo)', () => {
    const start = parsePlainDate('2026-04-16', 'America/Sao_Paulo')
    const end = parsePlainDate('2026-04-16', 'America/Sao_Paulo')
    expect(start.getTime()).toBe(end.getTime())
  })

  it('rejeita string fora do formato', () => {
    expect(() => parsePlainDate('16-04-2026', 'America/Sao_Paulo')).toThrow('YYYY-MM-DD')
  })

  it('usa APP_CALENDAR_TIMEZONE quando definido', () => {
    const prev = process.env.APP_CALENDAR_TIMEZONE
    process.env.APP_CALENDAR_TIMEZONE = 'UTC'
    try {
      expect(getAppCalendarTimeZone()).toBe('UTC')
      const d = parsePlainDate('2026-04-16')
      expect(d.toISOString()).toBe('2026-04-16T00:00:00.000Z')
    } finally {
      if (prev === undefined) delete process.env.APP_CALENDAR_TIMEZONE
      else process.env.APP_CALENDAR_TIMEZONE = prev
    }
  })
})
