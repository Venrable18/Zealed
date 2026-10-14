import { useState } from 'react'
import { PARSE_ERROR_MESSAGES, parseZec } from '../lib/zec.ts'
import { TextInput } from './Field.tsx'

interface AmountInputProps {
  label?: string
  hint?: string
  /** Called on every change with the parsed amount, or null while the text is not valid. */
  onChange: (zat: bigint | null) => void
  /** Smallest allowed amount in zatoshis. */
  minZat?: bigint
  /** Largest allowed amount in zatoshis, e.g. the spendable balance. */
  maxZat?: bigint
}

/** ZEC amount field. Parses with bigint, shows plain-language errors once the person types. */
export function AmountInput({
  label = 'Amount (ZEC)',
  hint,
  onChange,
  minZat,
  maxZat,
}: AmountInputProps) {
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)

  const parsed = parseZec(text)
  let error: string | undefined
  if (touched || text !== '') {
    if (!parsed.ok) {
      if (parsed.reason !== 'empty' || touched) error = PARSE_ERROR_MESSAGES[parsed.reason]
    } else if (minZat !== undefined && parsed.zat < minZat) {
      error = 'That is below the minimum amount.'
    } else if (maxZat !== undefined && parsed.zat > maxZat) {
      error = 'That is more than you can spend.'
    }
  }

  return (
    <TextInput
      label={label}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      placeholder="0.00"
      value={text}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        const result = parseZec(next)
        const valid =
          result.ok &&
          (minZat === undefined || result.zat >= minZat) &&
          (maxZat === undefined || result.zat <= maxZat)
        onChange(valid ? result.zat : null)
      }}
      onBlur={() => {
        setTouched(true)
      }}
      {...(hint === undefined ? {} : { hint })}
      {...(error === undefined ? {} : { error })}
    />
  )
}
