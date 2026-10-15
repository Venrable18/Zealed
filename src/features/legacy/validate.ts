import { LEGACY_LETTER_MAX_BYTES } from '../../config/constants.ts'
import type { SealField, SealInput } from './types.ts'

/** The soonest a letter can open: a few drand rounds (3 s each) of headroom. */
export const MIN_LEAD_MS = 15_000
/** The furthest ahead a letter can be sealed. */
export const MAX_LEAD_MS = 50 * 365 * 24 * 60 * 60 * 1000
export const MIN_GIFT_ZAT = 100_000n

export function looksLikeAddress(text: string): boolean {
  return /^[A-Za-z0-9]{20,500}$/.test(text)
}

export type ValidateResult =
  { ok: true; value: SealInput } | { ok: false; errors: Partial<Record<SealField, string>> }

/** Checks what the person typed. `nowMs` is the current time, passed in so it can be tested. */
export function validateSeal(input: SealInput, nowMs: number): ValidateResult {
  const errors: Partial<Record<SealField, string>> = {}
  const recipient = input.recipient.trim()
  const letter = input.letter.trim()

  if (recipient === '') errors.recipient = 'Enter the recipient’s Zealed address.'
  else if (!looksLikeAddress(recipient))
    errors.recipient = 'That does not look like a Zcash address.'

  const letterBytes = new TextEncoder().encode(letter).length
  if (letter === '') errors.letter = 'Write something to seal.'
  else if (letterBytes > LEGACY_LETTER_MAX_BYTES) {
    errors.letter = `A letter can be up to ${String(LEGACY_LETTER_MAX_BYTES)} bytes. This one is ${String(letterBytes)}.`
  }

  if (input.amountZat !== null && input.amountZat < MIN_GIFT_ZAT) {
    errors.amount = 'The smallest gift is 0.001 ZEC.'
  }

  if (!Number.isFinite(input.unlockMs)) errors.unlock = 'Choose when the letter can be opened.'
  else if (input.unlockMs < nowMs + MIN_LEAD_MS) {
    errors.unlock = `Choose a time at least ${String(MIN_LEAD_MS / 1000)} seconds from now.`
  } else if (input.unlockMs > nowMs + MAX_LEAD_MS)
    errors.unlock = 'Choose a time within the next 50 years.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { recipient, letter, amountZat: input.amountZat, unlockMs: input.unlockMs },
  }
}
