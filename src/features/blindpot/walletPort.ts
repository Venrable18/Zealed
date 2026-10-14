import { createContext, useContext } from 'react'

/**
 * What Blind Pot needs from the wallet. The wallet (Phase 3, built on the WebZjs tooling)
 * provides an implementation. Every method returns aggregates, never per-payment details, so
 * the host screens cannot list individual gifts even by accident.
 */
export interface PotWalletPort {
  /** Creates a dedicated account for a pot, or a separate wallet if accounts are unsupported. */
  createPotAccount(label: string): Promise<{ accountId: string; address: string }>
  /** Total received by the pot account up to `atMs` (chain time). */
  balanceAsOf(accountId: string, atMs: number): Promise<bigint>
  /** How many separate payments (notes) the pot received up to `atMs`. */
  piecesAsOf(accountId: string, atMs: number): Promise<number>
  /** Raw memos received up to `atMs`, with no times and no amounts. */
  memosAsOf(accountId: string, atMs: number): Promise<Uint8Array[]>
  /** Moves everything in the pot account to the host's main account. */
  withdrawAll(accountId: string): Promise<{ txid: string }>
}

/** `null` until the wallet exists. Screens must handle that and say so plainly. */
export const PotWalletContext = createContext<PotWalletPort | null>(null)

export function usePotWallet(): PotWalletPort | null {
  return useContext(PotWalletContext)
}
