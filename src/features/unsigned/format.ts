import { UNSIGNED_MESSAGE_MAX_BYTES } from '../../config/constants.ts'
import { concat } from '../../crypto/bytes.ts'
import { looksLikeAddress } from '../legacy/validate.ts'
import { isPlainText } from './card.ts'

/**
 * UNSIGNED_MSG payload (carried in one or more ZMP chunks):
 *
 *   version (1) | flags (1) | [reply-to: length (2) + address] | [commitment (32)] | message text
 *
 * Flag bit 0: a reply-to address is present. Bit 1: a commitment is present (the optional
 * submission receipt, built in Phase 12). Anything else is rejected, so each message has exactly
 * one valid encoding.
 */
const VERSION = 1
const FLAG_REPLY = 1
const FLAG_COMMITMENT = 2
export const COMMITMENT_BYTES = 32

export interface UnsignedPayload {
  body: string
  /** A fresh address the recipient can answer to. */
  replyTo?: string
  /** SHA-256(salt || body), so the sender can later prove what they sent. */
  commitment?: Uint8Array
}

/** Text a person typed or received: limits, no control or bidi characters. Returns the trimmed text or null. */
export function cleanBody(text: string): string | null {
  const body = text.trim()
  if (body === '' || !isPlainText(body)) return null
  return new TextEncoder().encode(body).length <= UNSIGNED_MESSAGE_MAX_BYTES ? body : null
}

/** Builds a payload. Throws RangeError if the message is empty, too long or has unsafe characters. */
export function encodeUnsigned(payload: UnsignedPayload): Uint8Array {
  const body = cleanBody(payload.body)
  if (body === null) throw new RangeError('message is empty, too long or has unsafe characters')
  if (payload.replyTo !== undefined && !looksLikeAddress(payload.replyTo))
    throw new RangeError('reply address is not valid')
  if (payload.commitment !== undefined && payload.commitment.length !== COMMITMENT_BYTES)
    throw new RangeError('commitment must be 32 bytes')

  const reply =
    payload.replyTo === undefined ? new Uint8Array(0) : new TextEncoder().encode(payload.replyTo)
  const flags =
    (payload.replyTo === undefined ? 0 : FLAG_REPLY) |
    (payload.commitment === undefined ? 0 : FLAG_COMMITMENT)
  return concat(
    new Uint8Array([VERSION, flags]),
    payload.replyTo === undefined
      ? new Uint8Array(0)
      : new Uint8Array([reply.length >> 8, reply.length & 0xff]),
    reply,
    payload.commitment ?? new Uint8Array(0),
    new TextEncoder().encode(body),
  )
}

/** Reads a payload from untrusted bytes. Returns null if anything is wrong. Never throws. */
export function decodeUnsigned(bytes: Uint8Array): UnsignedPayload | null {
  try {
    if (bytes.length < 3 || bytes[0] !== VERSION) return null
    const flags = bytes[1] ?? 0
    if ((flags & ~(FLAG_REPLY | FLAG_COMMITMENT)) !== 0) return null
    let at = 2
    let replyTo: string | undefined
    if ((flags & FLAG_REPLY) !== 0) {
      if (at + 2 > bytes.length) return null
      const length = ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
      at += 2
      if (at + length > bytes.length) return null
      replyTo = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(at, at + length))
      at += length
      if (!looksLikeAddress(replyTo)) return null
    }
    let commitment: Uint8Array | undefined
    if ((flags & FLAG_COMMITMENT) !== 0) {
      if (at + COMMITMENT_BYTES > bytes.length) return null
      commitment = bytes.slice(at, at + COMMITMENT_BYTES)
      at += COMMITMENT_BYTES
    }
    const body = cleanBody(new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(at)))
    if (body === null) return null
    return {
      body,
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(commitment === undefined ? {} : { commitment }),
    }
  } catch {
    return null
  }
}
