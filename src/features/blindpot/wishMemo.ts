import { WISH_MAX_CHARS } from '../../config/constants.ts'
import { encodeChunk, splitMessage } from '../../zmp/index.ts'
import { countGraphemes } from './pot.ts'
import { decodeWish } from './wishes.ts'

export type WishMemoResult =
  | { ok: true; memo: Uint8Array }
  | { ok: false; reason: 'empty' | 'too-many-characters' | 'too-many-bytes' | 'invalid' }

/**
 * Turns a guest's wish into the memo that travels with the 0.001 piece. The wish must fit one
 * memo (a single chunk) and must be something the host's screen will accept, so a wish the host
 * would silently drop is refused here instead.
 */
export function encodeWishMemo(text: string): WishMemoResult {
  const wish = text.trim()
  if (wish === '') return { ok: false, reason: 'empty' }
  if (countGraphemes(wish) > WISH_MAX_CHARS) return { ok: false, reason: 'too-many-characters' }

  const bytes = new TextEncoder().encode(wish)
  const chunks = splitMessage('WISH', bytes)
  const [chunk] = chunks
  if (chunk === undefined || chunks.length > 1) return { ok: false, reason: 'too-many-bytes' }
  if (decodeWish(bytes) === null) return { ok: false, reason: 'invalid' }
  return { ok: true, memo: encodeChunk(chunk) }
}

export const WISH_ERROR_MESSAGES = {
  'too-many-characters': `Keep your wish to ${String(WISH_MAX_CHARS)} characters or fewer.`,
  'too-many-bytes':
    'That wish is too long once emoji and special characters are counted. Shorten it.',
  invalid: 'The wish has characters that cannot be shown. Remove them.',
} as const
