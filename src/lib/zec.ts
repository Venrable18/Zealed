import { ZATOSHIS_PER_ZEC } from '../config/constants.ts'

/** Zcash supply cap, in zatoshis. No valid amount is above this. */
export const MAX_SUPPLY_ZAT = 21_000_000n * ZATOSHIS_PER_ZEC

const DECIMALS = 8

export type ParseZecResult =
  | { ok: true; zat: bigint }
  | { ok: false; reason: 'empty' | 'invalid' | 'too-many-decimals' | 'too-large' }

/**
 * Reads an amount typed by a person, e.g. "0.05" or ".5", into zatoshis. Only digits and one
 * "." are accepted. Uses bigint throughout, so there is no floating-point rounding.
 */
export function parseZec(text: string): ParseZecResult {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }
  const match = /^(\d*)(?:\.(\d*))?$/.exec(trimmed)
  if (match === null) return { ok: false, reason: 'invalid' }
  const whole = match[1] ?? ''
  const fraction = match[2] ?? ''
  if (whole === '' && fraction === '') return { ok: false, reason: 'invalid' }
  if (fraction.length > DECIMALS) return { ok: false, reason: 'too-many-decimals' }

  const zat =
    BigInt(whole === '' ? '0' : whole) * ZATOSHIS_PER_ZEC + BigInt(fraction.padEnd(DECIMALS, '0'))
  if (zat > MAX_SUPPLY_ZAT) return { ok: false, reason: 'too-large' }
  return { ok: true, zat }
}

export interface FormatZecOptions {
  /** Always show all 8 decimals instead of trimming trailing zeros. */
  fixed?: boolean
}

/** Formats zatoshis as ZEC, e.g. 100000n -> "0.001". Groups thousands with commas. */
export function formatZec(zat: bigint, { fixed = false }: FormatZecOptions = {}): string {
  const negative = zat < 0n
  const abs = negative ? -zat : zat
  const whole = (abs / ZATOSHIS_PER_ZEC).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  let fraction = (abs % ZATOSHIS_PER_ZEC).toString().padStart(DECIMALS, '0')
  if (!fixed) fraction = fraction.replace(/0+$/, '')
  const text = fraction === '' ? whole : `${whole}.${fraction}`
  return negative ? `-${text}` : text
}

export const PARSE_ERROR_MESSAGES = {
  empty: 'Enter an amount.',
  invalid: 'Use digits and a decimal point only.',
  'too-many-decimals': 'ZEC has at most 8 decimal places.',
  'too-large': 'That is more than the total ZEC supply.',
} as const
