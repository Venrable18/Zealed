import { POT_NAME_MAX_CHARS, countGraphemes, isValidDate } from './pot.ts'
import type { Pot } from './types.ts'

/** The contribution page (built in Phase 7) lives here; the pot data is in the URL fragment. */
export const CONTRIBUTE_PATH = '/blind-pot/give'
export const SHARE_FRAGMENT_KEY = 'pot'
const MAX_FRAGMENT_CHARS = 2000
const SHARE_VERSION = 1

/** What a contributor needs. Nothing about the host, balance or other contributions. */
export type SharedPot = Pick<Pot, 'id' | 'name' | 'cover' | 'eventDate' | 'endDate' | 'address'>

/**
 * Basic shape check only (letters and digits, sensible length). It stops stray characters from
 * reaching a URI. Whether it is a real Zcash address is checked by the wallet.
 */
export function looksLikeAddress(text: string): boolean {
  return /^[A-Za-z0-9]{20,500}$/.test(text)
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

/** Encodes the share data for use after `#pot=`. The server never sees a URL fragment. */
export function encodeShare(pot: SharedPot): string {
  const { id, name, cover, eventDate, endDate, address } = pot
  const json = JSON.stringify({ v: SHARE_VERSION, id, name, cover, eventDate, endDate, address })
  return toBase64Url(new TextEncoder().encode(json))
}

/** Reads share data from untrusted input. Returns null for anything that is not valid. Never throws. */
export function decodeShare(encoded: string): SharedPot | null {
  if (encoded.length === 0 || encoded.length > MAX_FRAGMENT_CHARS) return null
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(encoded))
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return null
    const { v, id, name, cover, eventDate, endDate, address } = data as Record<string, unknown>
    if (v !== SHARE_VERSION) return null
    if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) return null
    if (typeof name !== 'string' || name.trim() === '' || countGraphemes(name) > POT_NAME_MAX_CHARS)
      return null
    if (typeof cover !== 'string' || cover.length > 16) return null
    if (typeof eventDate !== 'string' || !isValidDate(eventDate)) return null
    if (typeof endDate !== 'string' || !isValidDate(endDate)) return null
    if (typeof address !== 'string' || !looksLikeAddress(address)) return null
    return { id, name, cover, eventDate, endDate, address }
  } catch {
    return null
  }
}

export function shareUrl(origin: string, pot: SharedPot): string {
  return `${origin}${CONTRIBUTE_PATH}#${SHARE_FRAGMENT_KEY}=${encodeShare(pot)}`
}

/** Reads the pot from a location hash such as "#pot=...". */
export function readShareFromHash(hash: string): SharedPot | null {
  const prefix = `#${SHARE_FRAGMENT_KEY}=`
  return hash.startsWith(prefix) ? decodeShare(hash.slice(prefix.length)) : null
}

/**
 * ZIP 321 payment request for wallets that cannot use the pot link. It is a single payment with
 * no splitting, so it gives weaker privacy. The amount is left for the payer to choose.
 * Throws RangeError if the address does not look like an address.
 */
export function buildZip321(options: { address: string; label?: string }): string {
  if (!looksLikeAddress(options.address)) throw new RangeError('address does not look valid')
  const uri = `zcash:${options.address}`
  const label = options.label?.trim()
  // encodeURIComponent only leaves characters that ZIP 321 allows unencoded in label values.
  return label === undefined || label === '' ? uri : `${uri}?label=${encodeURIComponent(label)}`
}
