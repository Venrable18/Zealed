import { create } from 'zustand'
import { createIndexedDbBackend, createMemoryBackend } from './backend.ts'
import { resetSensitiveData, startPersistence, type Persistence } from './persistence.ts'
import { Vault, VaultError } from './vault.ts'

/**
 * Where the vault stands.
 * - `checking`: still looking.
 * - `none`: no vault. The app works, but nothing is saved: data lives in memory and is lost on reload.
 * - `locked`: a vault exists. The app shows only the lock screen until the passphrase is entered.
 * - `unlocked`: the app is in use and its data is being saved, encrypted.
 * - `unavailable`: this browser cannot store data (for example some private windows). Like `none`.
 */
export type VaultStatus = 'checking' | 'none' | 'locked' | 'unlocked' | 'unavailable'

export const useVaultStatus = create<{ status: VaultStatus }>()(() => ({ status: 'checking' }))

const set = (status: VaultStatus) => {
  useVaultStatus.setState({ status })
}

let current: Vault | undefined
let persistence: Persistence | undefined
let failures = 0
let coolingUntil = 0

export const MAX_UNLOCK_FAILURES = 5
export const UNLOCK_COOLDOWN_MS = 30_000

function getVault(): Vault {
  if (current !== undefined) return current
  let backend
  try {
    backend = createIndexedDbBackend()
  } catch {
    backend = createMemoryBackend()
  }
  current = new Vault(backend)
  return current
}

/** Replaces the vault. For tests. */
export function configureVault(vault: Vault | undefined): void {
  current = vault
  persistence?.stop()
  persistence = undefined
  failures = 0
  coolingUntil = 0
  set('checking')
}

/** Finds out whether there is a vault. Call once when the app starts. */
export async function initVault(): Promise<void> {
  try {
    set((await getVault().exists()) ? 'locked' : 'none')
  } catch {
    set('unavailable')
  }
}

export type CreateResult =
  { ok: true } | { ok: false; reason: 'weak-passphrase' | 'exists' | 'unavailable' }

/** Makes a vault from the passphrase and saves what is in memory into it. */
export async function createVault(passphrase: string): Promise<CreateResult> {
  const vault = getVault()
  try {
    await vault.create(passphrase)
    persistence = await startPersistence(vault, { load: false })
    set('unlocked')
    return { ok: true }
  } catch (error) {
    if (
      error instanceof VaultError &&
      (error.code === 'weak-passphrase' || error.code === 'exists')
    )
      return { ok: false, reason: error.code }
    return { ok: false, reason: 'unavailable' }
  }
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: 'wrong-passphrase' | 'unavailable' }
  | { ok: false; reason: 'cooling-down'; retryInMs: number }

/**
 * Unlocks and loads the saved data. After five wrong passphrases in a row it pauses for 30 seconds.
 * (The pause is held in the page, so reloading clears it; the cost of each guess is what slows an
 * attacker down.)
 */
export async function unlockVault(
  passphrase: string,
  now: () => number = () => Date.now(),
): Promise<UnlockResult> {
  if (now() < coolingUntil)
    return { ok: false, reason: 'cooling-down', retryInMs: coolingUntil - now() }
  const vault = getVault()
  try {
    await vault.unlock(passphrase)
  } catch (error) {
    if (error instanceof VaultError && error.code === 'wrong-passphrase') {
      failures++
      if (failures >= MAX_UNLOCK_FAILURES) {
        failures = 0
        coolingUntil = now() + UNLOCK_COOLDOWN_MS
        return { ok: false, reason: 'cooling-down', retryInMs: UNLOCK_COOLDOWN_MS }
      }
      return { ok: false, reason: 'wrong-passphrase' }
    }
    return { ok: false, reason: 'unavailable' }
  }
  failures = 0
  try {
    persistence = await startPersistence(vault, { load: true })
  } catch {
    // The vault opened but its data could not be read (damaged). Stay locked rather than show half of it.
    vault.lock()
    resetSensitiveData()
    return { ok: false, reason: 'unavailable' }
  }
  set('unlocked')
  return { ok: true }
}

/** Saves what is pending, forgets the key, and removes all private data from memory. */
export async function lockVault(): Promise<void> {
  if (useVaultStatus.getState().status !== 'unlocked') return
  const active = persistence
  persistence = undefined
  await active?.flush()
  active?.stop()
  getVault().lock()
  resetSensitiveData()
  set('locked')
}

export type ChangeResult =
  { ok: true } | { ok: false; reason: 'wrong-passphrase' | 'weak-passphrase' | 'unavailable' }

export async function changeVaultPassphrase(
  oldPassphrase: string,
  newPassphrase: string,
): Promise<ChangeResult> {
  try {
    await persistence?.flush()
    await getVault().changePassphrase(oldPassphrase, newPassphrase)
    return { ok: true }
  } catch (error) {
    if (
      error instanceof VaultError &&
      (error.code === 'wrong-passphrase' || error.code === 'weak-passphrase')
    )
      return { ok: false, reason: error.code }
    return { ok: false, reason: 'unavailable' }
  }
}

/** Checks the passphrase again without unlocking, for actions that need the person to prove it. */
export function verifyVaultPassphrase(passphrase: string): Promise<boolean> {
  return getVault().verify(passphrase)
}

/** Deletes the vault and everything in it, and returns to having none. Used when wiping local data. */
export async function wipeVault(): Promise<void> {
  const active = persistence
  persistence = undefined
  active?.stop()
  try {
    await getVault().wipe()
  } catch {
    /* nothing to wipe, or storage is unavailable */
  }
  failures = 0
  coolingUntil = 0
  set('none')
}
