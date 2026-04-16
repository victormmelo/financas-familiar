import { toDate } from 'date-fns-tz'

/** String apenas calendário `YYYY-MM-DD` (sem hora / offset). */
export const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const DEFAULT_CALENDAR_TIMEZONE = 'America/Sao_Paulo'

/**
 * Fuso IANA usado para interpretar datas só-calendário vindas da API/MCP/workers.
 * Override: `APP_CALENDAR_TIMEZONE`.
 */
export function getAppCalendarTimeZone(): string {
  const raw = typeof process !== 'undefined' && process.env?.APP_CALENDAR_TIMEZONE != null
    ? process.env.APP_CALENDAR_TIMEZONE.trim()
    : ''
  return raw.length > 0 ? raw : DEFAULT_CALENDAR_TIMEZONE
}

/**
 * Converte `YYYY-MM-DD` no meia-noite civil do fuso informado (ou `getAppCalendarTimeZone()`)
 * num `Date` (instante UTC) adequado para Prisma/`@db.Date`.
 */
export function parsePlainDate(ymd: string, timeZone?: string): Date {
  const s = ymd.trim()
  if (!PLAIN_DATE_RE.test(s)) {
    throw new Error('Data inválida: use YYYY-MM-DD')
  }
  const tz = (timeZone?.trim() ?? '') || getAppCalendarTimeZone()
  const d = toDate(`${s}T00:00:00`, { timeZone: tz })
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Data ou fuso inválido: ${s} (${tz})`)
  }
  return d
}
