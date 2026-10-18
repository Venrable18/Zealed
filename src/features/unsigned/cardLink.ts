import { base64UrlToText, textToBase64Url } from '../../lib/base64url.ts'
import { countGraphemes } from '../blindpot/pot.ts'
import { looksLikeAddress } from '../legacy/validate.ts'
import {
  CARD_BIO_MAX,
  CARD_NAME_MAX,
  MAX_MINIMUM_ZAT,
  MIN_MINIMUM_ZAT,
  isPlainText,
  type Card,
} from './card.ts'

/** The sender page (Phase 12) lives here; the card is in the URL fragment, which servers never see. */
export const CARD_PATH = '/u'
const MAX_FRAGMENT_CHARS = 2000
const VERSION = 1

export function encodeCard(card: Card): string {
  return textToBase64Url(
    JSON.stringify({
      v: VERSION,
      n: card.name,
      b: card.bio,
      a: card.address,
      m: card.minimumZat.toString(),
      r: card.acceptsReplies ? 1 : 0,
    }),
  )
}

/** Reads a card from untrusted input. Returns null for anything that is not a valid card. Never throws. */
export function decodeCard(encoded: string): Card | null {
  if (encoded === '' || encoded.length > MAX_FRAGMENT_CHARS) return null
  const text = base64UrlToText(encoded)
  if (text === null) return null
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return null
    const { v, n, b, a, m, r } = data as Record<string, unknown>
    if (v !== VERSION) return null
    if (
      typeof n !== 'string' ||
      n.trim() === '' ||
      countGraphemes(n) > CARD_NAME_MAX ||
      !isPlainText(n) ||
      n.includes('\n')
    )
      return null
    if (typeof b !== 'string' || countGraphemes(b) > CARD_BIO_MAX || !isPlainText(b)) return null
    if (typeof a !== 'string' || !looksLikeAddress(a)) return null
    if (typeof m !== 'string' || !/^\d{1,15}$/.test(m)) return null
    const minimumZat = BigInt(m)
    if (minimumZat < MIN_MINIMUM_ZAT || minimumZat > MAX_MINIMUM_ZAT) return null
    if (r !== 0 && r !== 1) return null
    return { name: n, bio: b, address: a, minimumZat, acceptsReplies: r === 1 }
  } catch {
    return null
  }
}

export function cardUrl(origin: string, card: Card): string {
  return `${origin}${CARD_PATH}#${encodeCard(card)}`
}

export function readCardFromHash(hash: string): Card | null {
  return hash.startsWith('#') ? decodeCard(hash.slice(1)) : null
}
