import { createContext, useContext } from 'react'

/**
 * What exporting the seed phrase needs from the wallet. The wallet (Phase 3) provides it. The
 * passphrase is checked by the wallet itself, so Zealed never stores or compares it.
 */
export interface SeedPort {
  /** True if the passphrase unlocks the wallet. */
  verifyPassphrase(passphrase: string): Promise<boolean>
  /** The seed phrase, as words. Only called after the passphrase was verified. */
  exportSeed(): Promise<string[]>
}

/** `null` until the wallet exists. */
export const SeedContext = createContext<SeedPort | null>(null)

export function useSeedPort(): SeedPort | null {
  return useContext(SeedContext)
}
