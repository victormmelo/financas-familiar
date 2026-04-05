export interface ParsedStatementEntry {
  externalId: string
  type: 'INCOME' | 'EXPENSE'
  amount: number
  description: string
  date: Date
}

export interface OFXParseResult {
  entries: ParsedStatementEntry[]
  startDate?: Date
  endDate?: Date
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>([^<\n\r]*)`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : ''
}

function parseOFXDate(raw: string): Date | undefined {
  if (!raw) return undefined
  // Format: YYYYMMDD or YYYYMMDDHHmmss[.sss][TZ]
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length < 8) return undefined
  const year = parseInt(digits.slice(0, 4), 10)
  const month = parseInt(digits.slice(4, 6), 10) - 1
  const day = parseInt(digits.slice(6, 8), 10)
  return new Date(year, month, day)
}

export function parseOFX(raw: string): OFXParseResult {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Try to find STMTTRN blocks with closing tags first (XML OFX)
  const xmlPattern = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let blocks: string[] = []
  let m: RegExpExecArray | null

  while ((m = xmlPattern.exec(normalized)) !== null) {
    blocks.push(m[1])
  }

  // Fallback: SGML OFX (no closing tags) — split on <STMTTRN>
  if (blocks.length === 0) {
    const parts = normalized.split(/<STMTTRN>/i)
    blocks = parts.slice(1).map((part) => {
      // End of block is marked by </STMTTRNLIST> or next token starting with <
      const endIdx = part.search(/<\/STMTTRNLIST>|<STMTTRN>/i)
      return endIdx >= 0 ? part.slice(0, endIdx) : part
    })
  }

  const entries: ParsedStatementEntry[] = []
  const seenIds = new Set<string>()

  for (const block of blocks) {
    const dtPosted = extractTag(block, 'DTPOSTED')
    const trnAmtRaw = extractTag(block, 'TRNAMT')
    const fitId = extractTag(block, 'FITID')
    const name = extractTag(block, 'NAME')
    const memo = extractTag(block, 'MEMO')

    const date = parseOFXDate(dtPosted)
    const trnAmt = parseFloat(trnAmtRaw.replace(',', '.'))

    if (!date || isNaN(trnAmt)) continue

    const amount = Math.abs(trnAmt)
    const type: 'INCOME' | 'EXPENSE' = trnAmt >= 0 ? 'INCOME' : 'EXPENSE'
    const description = (name || memo || 'Sem descrição').slice(0, 255)

    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    const externalId = fitId || `${dateStr}-${amount.toFixed(2)}-${description.slice(0, 30)}`

    if (seenIds.has(externalId)) continue
    seenIds.add(externalId)

    entries.push({ externalId, type, amount, description, date })
  }

  // Extract statement period dates
  const dtStart = extractTag(normalized, 'DTSTART')
  const dtEnd = extractTag(normalized, 'DTEND')

  return {
    entries,
    startDate: parseOFXDate(dtStart),
    endDate: parseOFXDate(dtEnd),
  }
}
