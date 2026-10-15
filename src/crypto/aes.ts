import { concat, randomBytes, toBuffer } from './bytes.ts'
import { CryptoError } from './errors.ts'

export const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

/** A fresh random AES-256 key. */
export function generateKey(): Uint8Array {
  return randomBytes(KEY_BYTES)
}

/** Bytes added to every plaintext: the IV and the authentication tag. */
export const AES_OVERHEAD_BYTES = IV_BYTES + TAG_BYTES

function gcmParams(iv: Uint8Array, aad: Uint8Array | undefined): AesGcmParams {
  const base = { name: 'AES-GCM', iv: toBuffer(iv) }
  return aad === undefined ? base : { ...base, additionalData: toBuffer(aad) }
}

async function importKey(key: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  if (key.length !== KEY_BYTES) throw new CryptoError('invalid-input')
  return crypto.subtle.importKey('raw', toBuffer(key), 'AES-GCM', false, [usage])
}

/**
 * AES-256-GCM. Returns IV (12 random bytes) followed by ciphertext and tag. Each bundle uses its
 * own fresh key, so a random IV is safe here. `aad` is authenticated but not encrypted: it ties
 * the ciphertext to the context it was made for, so it cannot be moved into another bundle.
 */
export async function encrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await importKey(key, 'encrypt')
  const iv = randomBytes(IV_BYTES)
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(gcmParams(iv, aad), cryptoKey, toBuffer(plaintext)),
  )
  return concat(iv, sealed)
}

/** Throws CryptoError('decrypt-failed') for a wrong key, wrong `aad` or any change to the data. */
export async function decrypt(
  key: Uint8Array,
  data: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await importKey(key, 'decrypt')
  if (data.length < AES_OVERHEAD_BYTES) throw new CryptoError('decrypt-failed')
  const iv = data.slice(0, IV_BYTES)
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(gcmParams(iv, aad), cryptoKey, toBuffer(data.slice(IV_BYTES))),
    )
  } catch {
    throw new CryptoError('decrypt-failed')
  }
}

/** Commitment to a key: lets someone who rebuilds a key check it without revealing it. */
export async function keyCommitment(key: Uint8Array): Promise<Uint8Array> {
  const label = new TextEncoder().encode('zealed-key-commit-v1')
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toBuffer(concat(label, key))))
}
