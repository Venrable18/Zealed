import { combine, split } from 'shamir-secret-sharing'
import { GUARDIANS_MAX, GUARDIANS_MIN } from '../config/constants.ts'
import { concat } from './bytes.ts'
import { CryptoError } from './errors.ts'

/**
 * Shamir secret sharing for a key. The underlying library cannot tell if it was given too few
 * shares (it just returns a wrong value), so each share is wrapped with the threshold and count.
 * That lets `combineShares` refuse too few shares outright.
 *
 * Share envelope: version (1), threshold (1), total (1), then the library's share.
 */
const VERSION = 1
const HEADER = 3

export async function splitSecret(
  secret: Uint8Array,
  total: number,
  threshold: number,
): Promise<Uint8Array[]> {
  if (
    !Number.isInteger(total) ||
    !Number.isInteger(threshold) ||
    total < GUARDIANS_MIN ||
    total > GUARDIANS_MAX ||
    threshold < 2 ||
    threshold > total ||
    secret.length === 0
  ) {
    throw new CryptoError('invalid-input')
  }
  const shares = await split(secret, total, threshold)
  return shares.map((share) => concat(new Uint8Array([VERSION, threshold, total]), share))
}

/**
 * Rebuilds the secret. Throws 'insufficient-shares' with fewer than the threshold, and 'bad-share'
 * for malformed, mismatched or repeated shares. A wrong share that is well-formed cannot be
 * detected here: check the result against a key commitment.
 */
export async function combineShares(envelopes: Uint8Array[]): Promise<Uint8Array> {
  const first = envelopes[0]
  if (first === undefined) throw new CryptoError('insufficient-shares')
  const threshold = first[1] ?? 0
  const total = first[2] ?? 0

  for (const envelope of envelopes) {
    if (envelope.length <= HEADER + 1 || envelope[0] !== VERSION) throw new CryptoError('bad-share')
    if (envelope[1] !== threshold || envelope[2] !== total || envelope.length !== first.length) {
      throw new CryptoError('bad-share')
    }
  }
  const unique = new Set(envelopes.map((envelope) => Array.from(envelope).join(',')))
  const indexes = new Set(envelopes.map((envelope) => envelope[envelope.length - 1]))
  if (unique.size !== envelopes.length || indexes.size !== envelopes.length)
    throw new CryptoError('bad-share')
  if (envelopes.length < threshold) throw new CryptoError('insufficient-shares')

  try {
    return await combine(envelopes.map((envelope) => envelope.slice(HEADER)))
  } catch {
    throw new CryptoError('bad-share')
  }
}

export interface ShareInfo {
  threshold: number
  total: number
  /** The share's x-coordinate, unique within one split. */
  index: number
}

/** Reads a share's header without combining anything. Returns null if it is not a valid envelope. */
export function inspectShare(envelope: Uint8Array): ShareInfo | null {
  if (envelope.length <= HEADER + 1 || envelope[0] !== VERSION) return null
  const threshold = envelope[1] ?? 0
  const total = envelope[2] ?? 0
  const index = envelope[envelope.length - 1] ?? 0
  if (threshold < 2 || total < threshold || total > GUARDIANS_MAX) return null
  return { threshold, total, index }
}
