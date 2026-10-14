import { WISH_MAX_CHARS } from '../../config/constants.ts'
import { countGraphemes } from './pot.ts'

const MAX_WISH_BYTES = 1024
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/
/** Bidirectional overrides can make text read differently from how it is stored. */
const BIDI_OVERRIDES = /[‪-‮⁦-⁩]/

/**
 * Reads a WISH message payload (UTF-8 text). Returns null if it is empty, too long, not valid
 * UTF-8 or contains control or bidirectional-override characters. Never throws.
 */
export function decodeWish(payload: Uint8Array): string | null {
  if (payload.length === 0 || payload.length > MAX_WISH_BYTES) return null
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(payload).trim()
  } catch {
    return null
  }
  if (text === '' || CONTROL_CHARS.test(text) || BIDI_OVERRIDES.test(text)) return null
  if (countGraphemes(text) > WISH_MAX_CHARS) return null
  return text
}

/** FNV-1a, 32-bit. Only used to seed the shuffle, not for anything secret. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Shuffles deterministically from `seed`, so the order stays the same within one batch and
 * changes in the next. Wishes therefore show no arrival order.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items]
  let state = hash(seed)
  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const a = result[i] as T
    result[i] = result[j] as T
    result[j] = a
  }
  return result
}
