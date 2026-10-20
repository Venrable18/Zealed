import { deserialize, serialize } from '../lib/serialize.ts'
import type { VaultBackend, VaultMeta } from './backend.ts'

/**
 * The encrypted vault. A passphrase is stretched into an AES-256-GCM key (PBKDF2, SHA-256), held
 * only in memory, and every record is encrypted with it. Wrong passphrases, changed bytes, and a
 * record moved under another name are all detected, because each record is authenticated together
 * with its own name.
 *
 * What this does not do: protect data while the vault is unlocked and in memory, protect against a
 * weak passphrase, or recover a forgotten one. There is no reset: the only way forward is to wipe.
 */
export const DEFAULT_ITERATIONS = 600_000
export const MIN_PASSPHRASE_LENGTH = 10

const IV_BYTES = 12
const SALT_BYTES = 16
const VERIFIER_TEXT = 'zealed-vault-ok'
const AAD_PREFIX = 'zealed-vault-v1:'

export type VaultErrorCode =
  | 'weak-passphrase'
  | 'wrong-passphrase'
  | 'exists'
  | 'missing'
  | 'locked'
  | 'corrupt'
  | 'unavailable'

/** The message is a fixed phrase for the code and never contains data or the passphrase. */
export class VaultError extends Error {
  readonly code: VaultErrorCode

  constructor(code: VaultErrorCode) {
    super(code)
    this.name = 'VaultError'
    this.code = code
  }
}

/** Why a passphrase is too weak, or null if it is acceptable. */
export function passphraseProblem(passphrase: string): string | null {
  const text = passphrase.normalize('NFKC')
  if (text.length < MIN_PASSPHRASE_LENGTH)
    return `Use at least ${String(MIN_PASSPHRASE_LENGTH)} characters.`
  if (new Set(text).size < 4) return 'Use a passphrase with more variety.'
  return null
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function seal(key: CryptoKey, name: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const aad = new TextEncoder().encode(AAD_PREFIX + name)
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      key,
      new Uint8Array(plaintext),
    ),
  )
  const out = new Uint8Array(IV_BYTES + encrypted.length)
  out.set(iv, 0)
  out.set(encrypted, IV_BYTES)
  return out
}

async function open(key: CryptoKey, name: string, data: Uint8Array): Promise<Uint8Array> {
  if (data.length < IV_BYTES + 16) throw new VaultError('corrupt')
  const aad = new TextEncoder().encode(AAD_PREFIX + name)
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(data.slice(0, IV_BYTES)), additionalData: aad },
        key,
        new Uint8Array(data.slice(IV_BYTES)),
      ),
    )
  } catch {
    throw new VaultError('corrupt')
  }
}

export class Vault {
  private readonly backend: VaultBackend
  private readonly iterations: number
  private key: CryptoKey | undefined

  /** `iterations` is for tests only; the default is what real use needs. */
  constructor(backend: VaultBackend, options: { iterations?: number } = {}) {
    this.backend = backend
    this.iterations = options.iterations ?? DEFAULT_ITERATIONS
  }

  get unlocked(): boolean {
    return this.key !== undefined
  }

  async exists(): Promise<boolean> {
    return (await this.backend.getMeta()) !== undefined
  }

  /** Makes a new vault, unlocked. Throws 'exists' if there already is one and 'weak-passphrase' if the passphrase is too weak. */
  async create(passphrase: string): Promise<void> {
    if (passphraseProblem(passphrase) !== null) throw new VaultError('weak-passphrase')
    if (await this.exists()) throw new VaultError('exists')
    const meta = await this.newMeta(passphrase)
    await this.backend.putMeta(meta.meta)
    this.key = meta.key
  }

  private async newMeta(passphrase: string): Promise<{ meta: VaultMeta; key: CryptoKey }> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
    const key = await deriveKey(passphrase, salt, this.iterations)
    const verifier = await seal(key, 'verifier', new TextEncoder().encode(VERIFIER_TEXT))
    return { meta: { version: 1, salt, iterations: this.iterations, verifier }, key }
  }

  /** Unlocks with the passphrase. Throws 'wrong-passphrase' (nothing else is revealed) or 'missing'. */
  async unlock(passphrase: string): Promise<void> {
    this.key = await this.check(passphrase)
  }

  /** Derives the key and checks it against the verifier, without changing the vault's state. */
  private async check(passphrase: string): Promise<CryptoKey> {
    const meta = await this.backend.getMeta()
    if (meta === undefined) throw new VaultError('missing')
    const key = await deriveKey(passphrase, meta.salt, meta.iterations)
    try {
      const text = new TextDecoder().decode(await open(key, 'verifier', meta.verifier))
      if (text !== VERIFIER_TEXT) throw new Error()
    } catch {
      throw new VaultError('wrong-passphrase')
    }
    return key
  }

  /** Forgets the key. Nothing can be read or written until the next unlock. */
  lock(): void {
    this.key = undefined
  }

  /** Re-checks a passphrase without unlocking, for actions that need the person to prove it again. */
  async verify(passphrase: string): Promise<boolean> {
    try {
      await this.check(passphrase)
      return true
    } catch {
      return false
    }
  }

  async get(name: string): Promise<unknown> {
    const key = this.requireKey()
    const data = await this.backend.getRecord(name)
    if (data === undefined) return undefined
    try {
      return deserialize(new TextDecoder().decode(await open(key, name, data)))
    } catch (error) {
      if (error instanceof VaultError) throw error
      throw new VaultError('corrupt')
    }
  }

  async set(name: string, value: unknown): Promise<void> {
    const key = this.requireKey()
    await this.backend.putRecord(
      name,
      await seal(key, name, new TextEncoder().encode(serialize(value))),
    )
  }

  async delete(name: string): Promise<void> {
    this.requireKey()
    await this.backend.deleteRecord(name)
  }

  /**
   * Changes the passphrase: every record is re-encrypted under a new key and salt, and the old and
   * new states are swapped in one step. Throws 'wrong-passphrase' if the old one is wrong.
   */
  async changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<void> {
    if (passphraseProblem(newPassphrase) !== null) throw new VaultError('weak-passphrase')
    const oldKey = await this.check(oldPassphrase)
    const records = await this.backend.getAllRecords()
    const plain: [string, Uint8Array][] = []
    for (const [name, data] of records) plain.push([name, await open(oldKey, name, data)])
    const next = await this.newMeta(newPassphrase)
    const sealed: [string, Uint8Array][] = []
    for (const [name, bytes] of plain) sealed.push([name, await seal(next.key, name, bytes)])
    await this.backend.replaceAll(next.meta, sealed)
    this.key = next.key
  }

  /** Deletes the vault and everything in it. */
  async wipe(): Promise<void> {
    this.key = undefined
    await this.backend.clear()
    // Let go of the database, so the browser can delete it entirely.
    await this.backend.close()
  }

  private requireKey(): CryptoKey {
    if (this.key === undefined) throw new VaultError('locked')
    return this.key
  }
}
