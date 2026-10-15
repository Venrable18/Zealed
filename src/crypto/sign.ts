import { ed25519 } from '@noble/curves/ed25519.js'
import { concat, bytesToU64, constantTimeEqual, u64ToBytes } from './bytes.ts'

/**
 * Ed25519 signatures for Legacy Mode B. Sender addresses are hidden in Zcash, so a signature is the
 * only proof that a check-in or revoke came from the owner.
 *
 * Each message type has its own domain tag, so a signature for one purpose can never be replayed as
 * another. Replay of the same type is stopped by a counter that must always go up.
 */
const CHECKIN_DOMAIN = new TextEncoder().encode('zealed-checkin-v1')
const REVOKE_DOMAIN = new TextEncoder().encode('zealed-revoke-v1')
export const BUNDLE_ID_BYTES = 16
const SIGNATURE_BYTES = 64
export const PUBLIC_KEY_BYTES = 32

/** A check-in message is: bundle ID, counter, timestamp, signature. */
const CHECKIN_BYTES = BUNDLE_ID_BYTES + 8 + 8 + SIGNATURE_BYTES
const REVOKE_BYTES = BUNDLE_ID_BYTES + 8 + SIGNATURE_BYTES

/** Guardians accept a check-in stamped at most this far ahead of their own clock. */
export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000

export interface Keypair {
  /** Keep secret. Never log, send or store unencrypted. */
  privateKey: Uint8Array
  publicKey: Uint8Array
}

export function generateKeypair(): Keypair {
  const privateKey = ed25519.utils.randomSecretKey()
  return { privateKey, publicKey: ed25519.getPublicKey(privateKey) }
}

export interface CheckIn {
  bundleId: Uint8Array
  counter: number
  timestampMs: number
}

function checkInMessage(checkIn: CheckIn): Uint8Array {
  return concat(
    CHECKIN_DOMAIN,
    checkIn.bundleId,
    u64ToBytes(checkIn.counter),
    u64ToBytes(checkIn.timestampMs),
  )
}

export function signCheckIn(privateKey: Uint8Array, checkIn: CheckIn): Uint8Array {
  if (checkIn.bundleId.length !== BUNDLE_ID_BYTES)
    throw new RangeError('bundle ID must be 16 bytes')
  const signature = ed25519.sign(checkInMessage(checkIn), privateKey)
  return concat(
    checkIn.bundleId,
    u64ToBytes(checkIn.counter),
    u64ToBytes(checkIn.timestampMs),
    signature,
  )
}

/** Returns the check-in if the signature is valid, otherwise null. Never throws. */
export function verifyCheckIn(publicKey: Uint8Array, data: Uint8Array): CheckIn | null {
  if (data.length !== CHECKIN_BYTES || publicKey.length !== PUBLIC_KEY_BYTES) return null
  try {
    const checkIn: CheckIn = {
      bundleId: data.slice(0, BUNDLE_ID_BYTES),
      counter: bytesToU64(data.slice(BUNDLE_ID_BYTES, BUNDLE_ID_BYTES + 8)),
      timestampMs: bytesToU64(data.slice(BUNDLE_ID_BYTES + 8, BUNDLE_ID_BYTES + 16)),
    }
    const signature = data.slice(BUNDLE_ID_BYTES + 16)
    return ed25519.verify(signature, checkInMessage(checkIn), publicKey, { zip215: false })
      ? checkIn
      : null
  } catch {
    return null
  }
}

export interface Revoke {
  bundleId: Uint8Array
  timestampMs: number
}

function revokeMessage(revoke: Revoke): Uint8Array {
  return concat(REVOKE_DOMAIN, revoke.bundleId, u64ToBytes(revoke.timestampMs))
}

export function signRevoke(privateKey: Uint8Array, revoke: Revoke): Uint8Array {
  if (revoke.bundleId.length !== BUNDLE_ID_BYTES) throw new RangeError('bundle ID must be 16 bytes')
  return concat(
    revoke.bundleId,
    u64ToBytes(revoke.timestampMs),
    ed25519.sign(revokeMessage(revoke), privateKey),
  )
}

export function verifyRevoke(publicKey: Uint8Array, data: Uint8Array): Revoke | null {
  if (data.length !== REVOKE_BYTES || publicKey.length !== PUBLIC_KEY_BYTES) return null
  try {
    const revoke: Revoke = {
      bundleId: data.slice(0, BUNDLE_ID_BYTES),
      timestampMs: bytesToU64(data.slice(BUNDLE_ID_BYTES, BUNDLE_ID_BYTES + 8)),
    }
    const signature = data.slice(BUNDLE_ID_BYTES + 8)
    return ed25519.verify(signature, revokeMessage(revoke), publicKey, { zip215: false })
      ? revoke
      : null
  } catch {
    return null
  }
}

export type CheckInRejection = 'invalid-signature' | 'wrong-bundle' | 'replayed' | 'from-the-future'

export type CheckInResult = { ok: true; checkIn: CheckIn } | { ok: false; reason: CheckInRejection }

/**
 * A guardian's record of check-ins for one bundle. It accepts a check-in only if the signature is
 * valid, it is for this bundle, its counter is higher than any accepted before (so a captured
 * check-in cannot be replayed), and its timestamp is not in the future.
 */
export class CheckInTracker {
  private lastCounter = -1
  private lastTimestampMs = 0

  private readonly publicKey: Uint8Array
  private readonly bundleId: Uint8Array

  constructor(publicKey: Uint8Array, bundleId: Uint8Array) {
    this.publicKey = publicKey
    this.bundleId = bundleId
  }

  accept(data: Uint8Array, nowMs: number): CheckInResult {
    const checkIn = verifyCheckIn(this.publicKey, data)
    if (checkIn === null) return { ok: false, reason: 'invalid-signature' }
    if (!constantTimeEqual(checkIn.bundleId, this.bundleId))
      return { ok: false, reason: 'wrong-bundle' }
    if (checkIn.counter <= this.lastCounter) return { ok: false, reason: 'replayed' }
    if (checkIn.timestampMs > nowMs + MAX_CLOCK_SKEW_MS)
      return { ok: false, reason: 'from-the-future' }
    this.lastCounter = checkIn.counter
    this.lastTimestampMs = checkIn.timestampMs
    return { ok: true, checkIn }
  }

  /** Time of the last valid check-in, or null if none has arrived. */
  get lastCheckInMs(): number | null {
    return this.lastCounter < 0 ? null : this.lastTimestampMs
  }
}
