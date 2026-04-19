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

/**
 * Serializa um `Date` persistido como `@db.Date` (PostgreSQL) para JSON em `YYYY-MM-DD`.
 * Usa componentes UTC porque o driver costuma representar DATE como meia-noite UTC do dia civil.
 */
export function serializeDbDate(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('serializeDbDate: esperado Date válido')
  }
  const y = value.getUTCFullYear()
  const m = String(value.getUTCMonth() + 1).padStart(2, '0')
  const d = String(value.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function serializeDbDateOrNull(value: Date | null): string | null {
  if (value === null) return null
  return serializeDbDate(value)
}

/** Substitui `date: Date` por string `YYYY-MM-DD` na resposta HTTP/MCP (transações, transferências, etc.). */
export function wireTransactionDate<T extends { date: Date }>(row: T): Omit<T, 'date'> & { date: string } {
  return { ...row, date: serializeDbDate(row.date) }
}

/** Meta / campos opcionais `@db.Date`. */
export function wireGoalDeadline<G extends { deadline: Date | null }>(
  row: G,
): Omit<G, 'deadline'> & { deadline: string | null } {
  return {
    ...row,
    deadline: serializeDbDateOrNull(row.deadline),
  }
}

