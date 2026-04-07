import { describe, expect, it } from 'vitest'
import {
  centsToReaisNumber,
  formatBrlMoneyInputFromReais,
  normalizeReaisForApi,
  parseBrlMoneyStringToCents,
  reaisNumberToCents,
} from '@financas/shared-types'

describe('parseBrlMoneyStringToCents', () => {
  it('retorna null para vazio ou só espaços', () => {
    expect(parseBrlMoneyStringToCents('')).toBeNull()
    expect(parseBrlMoneyStringToCents('   ')).toBeNull()
  })

  it('interpreta milhar com ponto e decimal com vírgula', () => {
    expect(parseBrlMoneyStringToCents('1.234,56')).toBe(123456)
  })

  it('aceita inteiro sem vírgula', () => {
    expect(parseBrlMoneyStringToCents('1234')).toBe(123400)
  })

  it('aceita vírgula decimal com parte inteira vazia', () => {
    expect(parseBrlMoneyStringToCents(',5')).toBe(50)
    expect(parseBrlMoneyStringToCents('0,5')).toBe(50)
  })

  it('arredonda centavos quando há mais de 2 casas decimais', () => {
    expect(parseBrlMoneyStringToCents('0,005')).toBe(1)
    expect(parseBrlMoneyStringToCents('10,999')).toBe(1100)
  })

  it('rejeita múltiplas vírgulas ou caracteres inválidos', () => {
    expect(parseBrlMoneyStringToCents('1,2,3')).toBeNull()
    expect(parseBrlMoneyStringToCents('10a')).toBeNull()
  })

  it('rejeita grupo de milhar com tamanho inválido', () => {
    expect(parseBrlMoneyStringToCents('12.34')).toBeNull()
  })
})

describe('centsToReaisNumber e normalizeReaisForApi', () => {
  it('converte centavos em reais', () => {
    expect(centsToReaisNumber(123456)).toBe(1234.56)
  })

  it('normaliza float com lixo binário', () => {
    const dirty = 0.1 + 0.2
    expect(normalizeReaisForApi(dirty)).toBe(0.3)
  })
})

describe('reaisNumberToCents', () => {
  it('arredonda reais para centavos (evita artefatos de float)', () => {
    expect(reaisNumberToCents(1.005)).toBe(100)
    expect(reaisNumberToCents(2.675)).toBe(268)
  })
})

describe('formatBrlMoneyInputFromReais', () => {
  it('formata com 2 decimais pt-BR sem símbolo', () => {
    expect(formatBrlMoneyInputFromReais(1234.56)).toBe('1.234,56')
    expect(formatBrlMoneyInputFromReais(0)).toBe('0,00')
  })

  it('retorna string vazia para null/undefined', () => {
    expect(formatBrlMoneyInputFromReais(null)).toBe('')
    expect(formatBrlMoneyInputFromReais(undefined)).toBe('')
  })
})
