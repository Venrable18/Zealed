import type { ChainClient } from 'tlock-js'
import { LEGACY_LETTER_MAX_BYTES } from '../config/constants.ts'
import { MAX_MESSAGE_BYTES } from '../zmp/index.ts'
import { decrypt, encrypt, generateKey, keyCommitment } from './aes.ts'
import { bytesToU64, concat, constantTimeEqual, randomBytes, u64ToBytes } from './bytes.ts'
import { CryptoError } from './errors.ts'
import { combineShares, splitSecret } from './shamir.ts'
import { BUNDLE_ID_BYTES, PUBLIC_KEY_BYTES, generateKeypair, type Keypair } from './sign.ts'
import { lockKey, unlockKey } from './tlock.ts'

/**
 * Sealed bundle: what a Legacy letter becomes on the wire (sent as SEALED_BUNDLE memos).
 *
 *   "ZB" | version (1) | mode (1) | bundle ID (16) | created at ms (8) |
 *   ciphertext length (4) | ciphertext |
 *   mode 1, timelock:  round (8) | locked key length (2) | locked key
 *   mode 2, guardians: policy length (2) | policy
 *
 * The ciphertext is AES-256-GCM over the content, authenticated with the header, so it cannot be
 * moved into another bundle or have its mode or ID changed.
 */
const BUNDLE_MAGIC = [0x5a, 0x42] // "ZB"
const POLICY_MAGIC = [0x5a, 0x50] // "ZP"
const VERSION = 1
const MODE_TIMELOCK = 1
const MODE_GUARDIANS = 2
const HEADER_BYTES = 2 + 1 + 1 + BUNDLE_ID_BYTES + 8
const MAX_SEED_BYTES = 400
const MAX_ADDRESS_CHARS = 500

/** What the recipient opens: the letter and, if funds were included, the gift wallet's seed phrase. */
export interface LegacyContent {
  letter: string
  giftSeed?: string
}

export function encodeContent(content: LegacyContent): Uint8Array {
  const letterBytes = new TextEncoder().encode(content.letter).length
  const seedBytes = new TextEncoder().encode(content.giftSeed ?? '').length
  if (letterBytes > LEGACY_LETTER_MAX_BYTES || seedBytes > MAX_SEED_BYTES)
    throw new CryptoError('invalid-input')
  const json = JSON.stringify({
    v: 1,
    letter: content.letter,
    ...(content.giftSeed === undefined ? {} : { giftSeed: content.giftSeed }),
  })
  return new TextEncoder().encode(json)
}

/** Reads decrypted content. Throws 'bad-bundle' if it is not what encodeContent produces. */
export function decodeContent(bytes: Uint8Array): LegacyContent {
  try {
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (typeof data !== 'object' || data === null) throw new Error()
    const { v, letter, giftSeed } = data as Record<string, unknown>
    if (v !== 1 || typeof letter !== 'string') throw new Error()
    if (giftSeed !== undefined && typeof giftSeed !== 'string') throw new Error()
    return giftSeed === undefined ? { letter } : { letter, giftSeed }
  } catch {
    throw new CryptoError('bad-bundle')
  }
}

// --- Policy (Mode B) -------------------------------------------------------------------------

/** The rules guardians follow. Contains no secrets: a key commitment, never the key. */
export interface Policy {
  bundleId: Uint8Array
  threshold: number
  total: number
  /** SHA-256 commitment to the content key, to check a rebuilt key. */
  keyCommitment: Uint8Array
  /** The owner's Ed25519 check-in public key. */
  checkInPublicKey: Uint8Array
  /** How long between check-ins before guardians raise an alert (P). */
  periodMs: number
  /** Extra time after that before shares are released (G). */
  graceMs: number
  heirAddress: string
}

function isAddressShape(text: string): boolean {
  return text.length >= 20 && text.length <= MAX_ADDRESS_CHARS && /^[A-Za-z0-9]+$/.test(text)
}

export function encodePolicy(policy: Policy): Uint8Array {
  const address = new TextEncoder().encode(policy.heirAddress)
  if (!isAddressShape(policy.heirAddress)) throw new CryptoError('invalid-input')
  return concat(
    new Uint8Array([...POLICY_MAGIC, VERSION, policy.threshold, policy.total]),
    policy.bundleId,
    policy.keyCommitment,
    policy.checkInPublicKey,
    u64ToBytes(policy.periodMs),
    u64ToBytes(policy.graceMs),
    new Uint8Array([address.length >> 8, address.length & 0xff]),
    address,
  )
}

/** Reads a policy from untrusted bytes. Returns null if anything is wrong. Never throws. */
export function decodePolicy(bytes: Uint8Array): Policy | null {
  try {
    const fixed = 2 + 1 + 2 + BUNDLE_ID_BYTES + 32 + PUBLIC_KEY_BYTES + 8 + 8 + 2
    if (
      bytes.length < fixed ||
      bytes[0] !== POLICY_MAGIC[0] ||
      bytes[1] !== POLICY_MAGIC[1] ||
      bytes[2] !== VERSION
    )
      return null
    const threshold = bytes[3] ?? 0
    const total = bytes[4] ?? 0
    if (threshold < 2 || total < threshold || total > 5) return null
    let at = 5
    const take = (length: number) => {
      const part = bytes.slice(at, at + length)
      at += length
      return part
    }
    const bundleId = take(BUNDLE_ID_BYTES)
    const commitment = take(32)
    const checkInPublicKey = take(PUBLIC_KEY_BYTES)
    const periodMs = bytesToU64(take(8))
    const graceMs = bytesToU64(take(8))
    const [high = 0, low = 0] = take(2)
    const addressLength = (high << 8) | low
    if (bytes.length !== at + addressLength) return null
    const heirAddress = new TextDecoder('utf-8', { fatal: true }).decode(take(addressLength))
    if (!isAddressShape(heirAddress)) return null
    return {
      bundleId,
      threshold,
      total,
      keyCommitment: commitment,
      checkInPublicKey,
      periodMs,
      graceMs,
      heirAddress,
    }
  } catch {
    return null
  }
}

function u32ToBytes(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ])
}

// --- Bundle ----------------------------------------------------------------------------------

export type SealedBundle =
  | {
      mode: 'timelock'
      bundleId: Uint8Array
      createdAtMs: number
      ciphertext: Uint8Array
      round: number
      lockedKey: Uint8Array
    }
  | {
      mode: 'guardians'
      bundleId: Uint8Array
      createdAtMs: number
      ciphertext: Uint8Array
      policy: Policy
    }

function modeCode(mode: SealedBundle['mode']): number {
  return mode === 'timelock' ? MODE_TIMELOCK : MODE_GUARDIANS
}

function header(mode: SealedBundle['mode'], bundleId: Uint8Array): Uint8Array {
  return new Uint8Array([...BUNDLE_MAGIC, VERSION, modeCode(mode), ...bundleId])
}

export function encodeBundle(bundle: SealedBundle): Uint8Array {
  const base = concat(
    new Uint8Array([...BUNDLE_MAGIC, VERSION, modeCode(bundle.mode)]),
    bundle.bundleId,
    u64ToBytes(bundle.createdAtMs),
    u32ToBytes(bundle.ciphertext.length),
    bundle.ciphertext,
  )
  let bytes: Uint8Array
  if (bundle.mode === 'timelock') {
    bytes = concat(
      base,
      u64ToBytes(bundle.round),
      new Uint8Array([bundle.lockedKey.length >> 8, bundle.lockedKey.length & 0xff]),
      bundle.lockedKey,
    )
  } else {
    const policy = encodePolicy(bundle.policy)
    bytes = concat(base, new Uint8Array([policy.length >> 8, policy.length & 0xff]), policy)
  }
  if (bytes.length > MAX_MESSAGE_BYTES) throw new CryptoError('invalid-input')
  return bytes
}

/** Reads a bundle from untrusted bytes. Returns null if anything is wrong. Never throws. */
export function decodeBundle(bytes: Uint8Array): SealedBundle | null {
  try {
    if (bytes.length < HEADER_BYTES + 4 || bytes.length > MAX_MESSAGE_BYTES) return null
    if (bytes[0] !== BUNDLE_MAGIC[0] || bytes[1] !== BUNDLE_MAGIC[1] || bytes[2] !== VERSION)
      return null
    const mode = bytes[3]
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    const bundleId = bytes.slice(4, 4 + BUNDLE_ID_BYTES)
    const createdAtMs = bytesToU64(bytes.slice(4 + BUNDLE_ID_BYTES, HEADER_BYTES))
    const cipherLength = view.getUint32(HEADER_BYTES)
    let at = HEADER_BYTES + 4
    if (cipherLength === 0 || at + cipherLength > bytes.length) return null
    const ciphertext = bytes.slice(at, at + cipherLength)
    at += cipherLength

    if (mode === MODE_TIMELOCK) {
      if (at + 10 > bytes.length) return null
      const round = bytesToU64(bytes.slice(at, at + 8))
      const lockLength = view.getUint16(at + 8)
      at += 10
      if (round < 1 || lockLength === 0 || at + lockLength !== bytes.length) return null
      return {
        mode: 'timelock',
        bundleId,
        createdAtMs,
        ciphertext,
        round,
        lockedKey: bytes.slice(at),
      }
    }
    if (mode === MODE_GUARDIANS) {
      if (at + 2 > bytes.length) return null
      const policyLength = view.getUint16(at)
      at += 2
      if (at + policyLength !== bytes.length) return null
      const policy = decodePolicy(bytes.slice(at))
      if (policy === null || !constantTimeEqual(policy.bundleId, bundleId)) return null
      return { mode: 'guardians', bundleId, createdAtMs, ciphertext, policy }
    }
    return null
  } catch {
    return null
  }
}

// --- Sealing and opening ---------------------------------------------------------------------

async function encryptContent(
  key: Uint8Array,
  mode: SealedBundle['mode'],
  bundleId: Uint8Array,
  content: LegacyContent,
) {
  return encrypt(key, encodeContent(content), header(mode, bundleId))
}

async function decryptContent(key: Uint8Array, bundle: SealedBundle): Promise<LegacyContent> {
  return decodeContent(await decrypt(key, bundle.ciphertext, header(bundle.mode, bundle.bundleId)))
}

/** Mode A. The content key is locked to the drand round for `unlockMs`. */
export async function sealTimelocked(options: {
  content: LegacyContent
  unlockMs: number
  nowMs: number
  client?: ChainClient
}): Promise<{ bundle: Uint8Array; bundleId: Uint8Array; round: number }> {
  const key = generateKey()
  const bundleId = randomBytes(BUNDLE_ID_BYTES)
  const ciphertext = await encryptContent(key, 'timelock', bundleId, options.content)
  const locked = await lockKey(key, options.unlockMs, options.client)
  const bundle = encodeBundle({
    mode: 'timelock',
    bundleId,
    createdAtMs: options.nowMs,
    ciphertext,
    round: locked.round,
    lockedKey: locked.ciphertext,
  })
  return { bundle, bundleId, round: locked.round }
}

/** Mode A. Throws 'not-yet' before the unlock round, 'unlock-failed' or 'decrypt-failed' otherwise. */
export async function openTimelocked(
  bundleBytes: Uint8Array,
  options: { client?: ChainClient; nowMs?: number } = {},
): Promise<LegacyContent> {
  const bundle = decodeBundle(bundleBytes)
  if (bundle?.mode !== 'timelock') throw new CryptoError('bad-bundle')
  const key = await unlockKey({ round: bundle.round, ciphertext: bundle.lockedKey }, options)
  return decryptContent(key, bundle)
}

/**
 * Mode B. Returns the bundle for the heir, one share per guardian, the policy the guardians
 * follow, and the owner's check-in keypair (the private key must be kept safe by the owner).
 */
export async function sealForGuardians(options: {
  content: LegacyContent
  heirAddress: string
  total: number
  threshold: number
  periodMs: number
  graceMs: number
  nowMs: number
}): Promise<{
  bundle: Uint8Array
  bundleId: Uint8Array
  shares: Uint8Array[]
  policy: Policy
  ownerKey: Keypair
}> {
  const key = generateKey()
  const bundleId = randomBytes(BUNDLE_ID_BYTES)
  const ownerKey = generateKeypair()
  const shares = await splitSecret(key, options.total, options.threshold)
  const policy: Policy = {
    bundleId,
    threshold: options.threshold,
    total: options.total,
    keyCommitment: await keyCommitment(key),
    checkInPublicKey: ownerKey.publicKey,
    periodMs: options.periodMs,
    graceMs: options.graceMs,
    heirAddress: options.heirAddress,
  }
  const ciphertext = await encryptContent(key, 'guardians', bundleId, options.content)
  const bundle = encodeBundle({
    mode: 'guardians',
    bundleId,
    createdAtMs: options.nowMs,
    ciphertext,
    policy,
  })
  return { bundle, bundleId, shares, policy, ownerKey }
}

/**
 * Mode B, for the heir. Throws 'insufficient-shares' with fewer shares than the threshold,
 * 'bad-share' for malformed shares, and 'wrong-key' if the shares do not rebuild the right key.
 */
export async function openWithShares(
  bundleBytes: Uint8Array,
  shares: Uint8Array[],
): Promise<LegacyContent> {
  const bundle = decodeBundle(bundleBytes)
  if (bundle?.mode !== 'guardians') throw new CryptoError('bad-bundle')
  const key = await combineShares(shares)
  if (!constantTimeEqual(await keyCommitment(key), bundle.policy.keyCommitment))
    throw new CryptoError('wrong-key')
  return decryptContent(key, bundle)
}
