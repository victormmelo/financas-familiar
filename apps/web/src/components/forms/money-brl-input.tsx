'use client'

import {
  centsToReaisNumber,
  formatBrlMoneyInputFromReais,
  normalizeReaisForApi,
  parseBrlMoneyStringToCents,
} from '@financas/shared-types'
import * as React from 'react'
import { Input, type InputProps } from '@/components/ui/input'

export type MoneyBrlInputProps = Omit<
  InputProps,
  'type' | 'value' | 'onChange' | 'defaultValue'
> & {
  /** Valor canônico em reais (2 decimais no significado monetário). */
  value: number | null | undefined
  onValueChange: (value: number | undefined) => void
}

/** Mantém no máximo uma vírgula (decimal pt-BR); pontos só antes da vírgula (milhar). */
function sanitizeMoneyTyping(raw: string): string {
  const t = raw.replace(/\s/g, '')
  if (t === '') return ''
  const firstComma = t.indexOf(',')
  if (firstComma === -1) {
    return t.replace(/[^\d.]/g, '')
  }
  const before = t.slice(0, firstComma).replace(/[^\d.]/g, '')
  const after = t.slice(firstComma + 1).replace(/[^\d]/g, '')
  return `${before},${after}`
}

export const MoneyBrlInput = React.forwardRef<HTMLInputElement, MoneyBrlInputProps>(
  function MoneyBrlInput(
    {
      value,
      onValueChange,
      onBlur,
      error,
      disabled,
      className,
      id,
      name,
      placeholder,
      'aria-describedby': ariaDescribedBy,
      ...rest
    },
    ref,
  ) {
    const [text, setText] = React.useState(() =>
      value === null || value === undefined ? '' : formatBrlMoneyInputFromReais(value),
    )
    const committedRef = React.useRef<number | undefined>(
      value === null || value === undefined ? undefined : normalizeReaisForApi(value),
    )

    React.useEffect(() => {
      const v = value === null || value === undefined ? undefined : normalizeReaisForApi(value)
      if (v !== committedRef.current) {
        committedRef.current = v
        setText(v === undefined ? '' : formatBrlMoneyInputFromReais(v))
      }
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setText(sanitizeMoneyTyping(e.target.value))
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const trimmed = text.trim()
      if (trimmed === '') {
        committedRef.current = undefined
        onValueChange(undefined)
        setText('')
        onBlur?.(e)
        return
      }

      const cents = parseBrlMoneyStringToCents(text)
      if (cents === null) {
        committedRef.current = undefined
        onValueChange(undefined)
        onBlur?.(e)
        return
      }

      const reais = normalizeReaisForApi(centsToReaisNumber(cents))
      committedRef.current = reais
      onValueChange(reais)
      setText(formatBrlMoneyInputFromReais(reais))
      onBlur?.(e)
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        id={id}
        name={name}
        className={className}
        disabled={disabled}
        error={error}
        placeholder={placeholder}
        aria-describedby={ariaDescribedBy}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        {...rest}
      />
    )
  },
)
MoneyBrlInput.displayName = 'MoneyBrlInput'
