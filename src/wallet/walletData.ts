import { create } from 'zustand'

export type WalletAccountKind = 'main' | 'pot' | 'gift'

/** One account in the wallet's database. */
export interface WalletAccount {
  /** The id the wallet gave the account. */
  id: number
  kind: WalletAccountKind
  label: string
  /** The ZIP 32 account index. Pot accounts use the wallet's seed; a gift account has its own. */
  hdIndex: number
  /** The first address of the account. */
  address: string
  /** Only for a gift account: the throwaway seed phrase, which also travels inside the sealed letter. */
  giftSeed?: string
}

export interface WalletData {
  /** The 24 words. Private: only ever held in memory, and in the encrypted vault. */
  seed: string | null
  /** The block the main account started at. 0 means a brand-new wallet, which starts near the chain tip. */
  birthday: number | null
  accounts: WalletAccount[]
  /** The wallet's database as the library serialises it (notes, blocks, sent transactions). */
  dbBytes: Uint8Array | null
}

interface WalletDataState extends WalletData {
  set: (data: Partial<WalletData>) => void
  reset: () => void
}

const EMPTY: WalletData = { seed: null, birthday: null, accounts: [], dbBytes: null }

/**
 * Everything the wallet needs to be opened again. It lives in the vault (see storage/persistence)
 * like the rest of the private data, and is emptied when the app locks or data is wiped.
 */
export const useWalletData = create<WalletDataState>()((set) => ({
  ...EMPTY,
  set: (data) => {
    set(data)
  },
  reset: () => {
    set(EMPTY)
  },
}))

export function validWalletData(data: unknown): WalletData | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if (typeof d['seed'] !== 'string' || !Array.isArray(d['accounts'])) return null
  const accounts = (d['accounts'] as unknown[]).filter(
    (a): a is WalletAccount =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as WalletAccount).id === 'number' &&
      typeof (a as WalletAccount).address === 'string' &&
      typeof (a as WalletAccount).hdIndex === 'number' &&
      ['main', 'pot', 'gift'].includes((a as WalletAccount).kind),
  )
  return {
    seed: d['seed'],
    birthday: typeof d['birthday'] === 'number' ? d['birthday'] : null,
    accounts,
    dbBytes: d['dbBytes'] instanceof Uint8Array ? d['dbBytes'] : null,
  }
}
