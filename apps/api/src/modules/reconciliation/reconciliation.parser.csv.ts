import type { ParsedStatementEntry } from './reconciliation.parser.ofx.js'

export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY'

export interface CSVColumnMapping {
  dateCol: number | string
  amountCol: number | string
  descriptionCol: number | string
  typeCol?: number | string
  dateFormat?: DateFormat
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5).join('\n')
  const counts = {
    ',': (sample.match(/,/g) ?? []).length,
    ';': (sample.match(/;/g) ?? []).length,
    '\t': (sample.match(/\t/g) ?? []).length,
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function splitCSVRow(row: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i++) {
    const char = row[i]
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function parseDate(raw: string, format?: DateFormat): Date | undefined {
  const cleaned = raw.trim()
  if (!cleaned) return undefined

  // Auto-detect if no format given
  if (!format) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) format = 'YYYY-MM-DD'
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) format = 'DD/MM/YYYY'
    else if (/^\d{2}-\d{2}-\d{4}$/.test(cleaned)) {
      const [d, m, y] = cleaned.split('-')
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    }
  }

  if (format === 'YYYY-MM-DD') {
    const [y, m, d] = cleaned.split('-')
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  }
  if (format === 'DD/MM/YYYY') {
    const [d, m, y] = cleaned.split('/')
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  }
  if (format === 'MM/DD/YYYY') {
    const [m, d, y] = cleaned.split('/')
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  }

  return undefined
}

function parseAmount(raw: string): number {
  // Remove currency symbol, spaces, then handle thousands/decimal separators
  let cleaned = raw.trim().replace(/^R\$\s*/, '').replace(/\s/g, '')
  // If format uses . as thousands and , as decimal (Brazilian): 1.234,56
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // Otherwise just replace comma decimal
    cleaned = cleaned.replace(',', '.')
  }
  return parseFloat(cleaned)
}

function colIndex(header: string[], col: number | string): number {
  if (typeof col === 'number') return col
  const lc = col.toLowerCase()
  return header.findIndex((h) => h.toLowerCase().includes(lc))
}

function detectMapping(header: string[]): CSVColumnMapping | undefined {
  const h = header.map((s) => s.toLowerCase())

  const dateCol = h.findIndex((s) => s.includes('data') || s.includes('date') || s === 'dt')
  const amountCol = h.findIndex(
    (s) =>
      s.includes('valor') || s.includes('amount') || s.includes('value') || s.includes('vlr'),
  )
  const descriptionCol = h.findIndex(
    (s) =>
      s.includes('descri') ||
      s.includes('histórico') ||
      s.includes('historico') ||
      s.includes('memo') ||
      s.includes('narrat') ||
      s.includes('hist'),
  )
  const typeCol = h.findIndex(
    (s) => s.includes('tipo') || s.includes('type') || s === 'dc' || s === 'd/c',
  )

  if (dateCol === -1 || amountCol === -1 || descriptionCol === -1) return undefined

  return {
    dateCol,
    amountCol,
    descriptionCol,
    typeCol: typeCol >= 0 ? typeCol : undefined,
  }
}

function simpleHash(s: string): string {
  let h = 0
  for (let i = 0; i < Math.min(s.length, 64); i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

export function parseCSV(raw: string, mapping?: CSVColumnMapping): ParsedStatementEntry[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const delimiter = detectDelimiter(lines)
  const header = splitCSVRow(lines[0], delimiter)
  const resolvedMapping = mapping ?? detectMapping(header)

  // Fallback to positional defaults if detection fails
  const finalMapping: CSVColumnMapping = resolvedMapping ?? {
    dateCol: 0,
    amountCol: 2,
    descriptionCol: 1,
  }

  const dateIdx = colIndex(header, finalMapping.dateCol)
  const amountIdx = colIndex(header, finalMapping.amountCol)
  const descIdx = colIndex(header, finalMapping.descriptionCol)
  const typeIdx =
    finalMapping.typeCol !== undefined ? colIndex(header, finalMapping.typeCol) : -1

  const entries: ParsedStatementEntry[] = []
  const seenIds = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVRow(lines[i], delimiter)
    if (cols.length <= Math.max(dateIdx, amountIdx, descIdx)) continue

    const date = parseDate(cols[dateIdx] ?? '', finalMapping.dateFormat)
    const amount = parseAmount(cols[amountIdx] ?? '')
    const description = (cols[descIdx] ?? '').trim() || 'Sem descrição'

    if (!date || isNaN(amount) || amount === 0) continue

    let type: 'INCOME' | 'EXPENSE'
    if (typeIdx >= 0 && cols[typeIdx]) {
      const t = cols[typeIdx].trim().toUpperCase()
      type =
        t.startsWith('D') || t === 'DÉBITO' || t === 'DEBITO' || t === 'DEBIT'
          ? 'EXPENSE'
          : 'INCOME'
    } else {
      type = amount < 0 ? 'EXPENSE' : 'INCOME'
    }

    const absAmount = Math.abs(amount)
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    const externalId = simpleHash(`${dateStr}-${absAmount.toFixed(2)}-${description}`)

    if (seenIds.has(externalId)) continue
    seenIds.add(externalId)

    entries.push({ externalId, type, amount: absAmount, description, date })
  }

  return entries
}
