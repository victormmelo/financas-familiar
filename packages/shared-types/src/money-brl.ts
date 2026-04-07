/**
 * Contrato BRL (UI editável vs API/BD):
 * - Input mascarado: string pt-BR sem símbolo (ex.: "1.234,56"), 2 casas decimais no blur.
 * - Valor canônico: number em reais, arredondado a centavos (evita resíduos de float no JSON).
 */

const BRL_NUMBER_FORMAT = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Remove separadores de milhar e valida grupos (exceto o primeiro) com 3 dígitos. */
function stripThousandsDots(intSection: string): string | null {
  if (intSection === '') return ''
  const parts = intSection.split('.')
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p === '' || !/^\d+$/.test(p)) return null
    if (i > 0 && p.length !== 3) return null
  }
  return parts.join('')
}

/**
 * Interpreta parte inteira + fração decimal (só dígitos) como centavos, com arredondamento.
 */
function intAndFracToCents(intStr: string, fracStr: string): number | null {
  const stripped = stripThousandsDots(intStr)
  if (stripped === null) return null
  if (stripped === '' && fracStr === '') return null
  const intPart = stripped === '' ? 0 : parseInt(stripped, 10)
  if (!Number.isSafeInteger(intPart)) return null
  if (fracStr === '') {
    const c = intPart * 100
    return Number.isSafeInteger(c) ? c : null
  }
  if (!/^\d+$/.test(fracStr)) return null
  const len = fracStr.length
  const fracNum = parseInt(fracStr, 10)
  const scaled = intPart * 10 ** len + fracNum
  if (!Number.isSafeInteger(scaled)) return null
  const cents = Math.round((scaled * 100) / 10 ** len)
  if (!Number.isSafeInteger(cents)) return null
  return cents
}

/**
 * Converte texto digitado no padrão brasileiro (milhar `.`, decimal `,`) em centavos inteiros.
 * @returns `null` se vazio ou inválido (vírgulas múltiplas, caracteres inválidos, grupos de milhar incorretos).
 */
export function parseBrlMoneyStringToCents(raw: string): number | null {
  const s = raw.replace(/\s/g, '')
  if (s === '') return null
  if (/[^0-9.,]/.test(s)) return null
  const commas = (s.match(/,/g) ?? []).length
  if (commas > 1) return null

  if (commas === 1) {
    const i = s.lastIndexOf(',')
    const intSection = s.slice(0, i)
    const fracSection = s.slice(i + 1)
    if (fracSection.includes('.') || intSection.includes(',')) return null
    if (fracSection !== '' && !/^\d+$/.test(fracSection)) return null
    return intAndFracToCents(intSection, fracSection)
  }

  // Sem vírgula: apenas milhares com `.` ou dígitos soltos
  return intAndFracToCents(s, '')
}

export function centsToReaisNumber(cents: number): number {
  return cents / 100
}

/** Arredonda reais (ex.: vindo da API) para o inteiro de centavos mais próximo. */
export function reaisNumberToCents(reais: number): number {
  return Math.round(reais * 100)
}

/** Formata reais para o valor exibido no input (pt-BR, 2 decimais, sem R$). */
export function formatBrlMoneyInputFromReais(reais: number | null | undefined): string {
  if (reais === null || reais === undefined || Number.isNaN(reais)) return ''
  const cents = reaisNumberToCents(reais)
  return BRL_NUMBER_FORMAT.format(centsToReaisNumber(cents))
}

/** Garante número em reais com exatamente 2 casas decimais no significado monetário (útil antes do JSON). */
export function normalizeReaisForApi(reais: number): number {
  return centsToReaisNumber(reaisNumberToCents(reais))
}
