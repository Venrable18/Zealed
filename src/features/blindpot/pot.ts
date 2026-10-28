import type { Pot } from './types.ts'

export const POT_NAME_MAX_CHARS = 60

export interface PotInput {
  name: string
  cover: string
  eventDate: string
  endDate: string
}

export type PotInputField = keyof PotInput

export type ValidatePotResult =
  { ok: true; value: PotInput } | { ok: false; errors: Partial<Record<PotInputField, string>> }

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function countGraphemes(text: string): number {
  return Array.from(graphemes.segment(text)).length
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/** Today's date in the person's own time zone, as YYYY-MM-DD. */
export function todayString(nowMs: number): string {
  const date = new Date(nowMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/

/**
 * Checks what a host typed. `today` is YYYY-MM-DD. The last day for gifts may be before, on or
 * after the event (a host may want gifts in before the day), but it may not be in the past.
 */
export function validatePotInput(input: PotInput, today: string): ValidatePotResult {
  const errors: Partial<Record<PotInputField, string>> = {}
  const name = input.name.trim()
  const cover = input.cover.trim()

  if (name === '') errors.name = 'Give the pot a name.'
  else if (countGraphemes(name) > POT_NAME_MAX_CHARS) {
    errors.name = `Keep the name to ${String(POT_NAME_MAX_CHARS)} characters or fewer.`
  } else if (CONTROL_CHARS.test(name)) errors.name = 'The name has characters that cannot be shown.'

  if (
    cover !== '' &&
    (countGraphemes(cover) !== 1 || cover.length > 16 || CONTROL_CHARS.test(cover))
  ) {
    errors.cover = 'Use a single emoji, or leave it empty.'
  }

  if (!isValidDate(input.eventDate)) errors.eventDate = 'Choose the event date.'
  if (!isValidDate(input.endDate)) errors.endDate = 'Choose the last day for gifts.'
  else if (input.endDate < today) errors.endDate = 'The last day for gifts cannot be in the past.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name, cover, eventDate: input.eventDate, endDate: input.endDate } }
}

export function newPotId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function newPot(
  input: PotInput,
  account: { accountId: string; address: string },
  options: { nowMs: number; batchIntervalMs: number },
): Pot {
  return {
    id: newPotId(),
    ...input,
    batchIntervalMs: options.batchIntervalMs,
    createdAtMs: options.nowMs,
    accountId: account.accountId,
    address: account.address,
    closed: false,
  }
}
