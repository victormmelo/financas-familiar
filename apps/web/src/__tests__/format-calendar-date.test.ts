import { describe, expect, it } from 'vitest'
import { formatCalendarDate } from '../lib/utils'

describe('formatCalendarDate', () => {
  it('formata ISO meia-noite UTC do Prisma (@db.Date) sem voltar um dia em ambientes não-UTC', () => {
    expect(formatCalendarDate('2026-04-18T00:00:00.000Z')).toBe('18/04/2026')
  })

  it('aceita string só-calendário YYYY-MM-DD', () => {
    expect(formatCalendarDate('2026-04-18')).toBe('18/04/2026')
  })

  it('retorna em dash para string vazia ou inválida', () => {
    expect(formatCalendarDate('')).toBe('—')
    expect(formatCalendarDate('   ')).toBe('—')
    expect(formatCalendarDate('invalid')).toBe('—')
  })
})
