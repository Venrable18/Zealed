import { countGraphemes } from '../blindpot/pot.ts'

export const CARD_NAME_MAX = 60
export const CARD_BIO_MAX = 280
/** The lowest minimum a card may ask for, so messages are never free. */
export const MIN_MINIMUM_ZAT = 100_000n
export const MAX_MINIMUM_ZAT = 100n * 100_000_000n

/** A contact card: what a sender sees before they write. Shared as a link; nothing is stored on a server. */
export interface Card {
  name: string
  bio: string
  /** A receiving address dedicated to this card, so payments through it can be told apart. */
  address: string
  /** Messages paying less than this go to a hidden folder. */
  minimumZat: bigint
  acceptsReplies: boolean
}

export interface CardInput {
  name: string
  bio: string
  minimumZat: bigint | null
  acceptsReplies: boolean
}

export type CardField = 'name' | 'bio' | 'minimum'

export type ValidateCardResult =
  | { ok: true; value: CardInput & { minimumZat: bigint } }
  | { ok: false; errors: Partial<Record<CardField, string>> }

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/
const BIDI_OVERRIDES = /[‪-‮⁦-⁩]/

/** True if text has nothing that could be used to disguise it (control or bidi-override characters). */
export function isPlainText(text: string): boolean {
  return !CONTROL_CHARS.test(text) && !BIDI_OVERRIDES.test(text)
}

export function validateCard(input: CardInput): ValidateCardResult {
  const errors: Partial<Record<CardField, string>> = {}
  const name = input.name.trim()
  const bio = input.bio.trim()

  if (name === '') errors.name = 'Give the card a name.'
  else if (countGraphemes(name) > CARD_NAME_MAX)
    errors.name = `Keep the name to ${String(CARD_NAME_MAX)} characters or fewer.`
  else if (!isPlainText(name) || name.includes('\n'))
    errors.name = 'The name has characters that cannot be shown.'

  if (countGraphemes(bio) > CARD_BIO_MAX)
    errors.bio = `Keep the bio to ${String(CARD_BIO_MAX)} characters or fewer.`
  else if (!isPlainText(bio)) errors.bio = 'The bio has characters that cannot be shown.'

  if (input.minimumZat === null) errors.minimum = 'Choose the smallest payment you will read.'
  else if (input.minimumZat < MIN_MINIMUM_ZAT)
    errors.minimum = 'The minimum cannot be below 0.001 ZEC.'
  else if (input.minimumZat > MAX_MINIMUM_ZAT)
    errors.minimum = 'The minimum cannot be above 100 ZEC.'

  if (Object.keys(errors).length > 0 || input.minimumZat === null) return { ok: false, errors }
  return {
    ok: true,
    value: { name, bio, minimumZat: input.minimumZat, acceptsReplies: input.acceptsReplies },
  }
}
