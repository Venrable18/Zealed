import { createContext, useContext } from 'react'

export type SweepResult =
  | { ok: true; sweptZat: bigint; txid: string }
  | { ok: false; reason: 'nothing-to-sweep' | 'not-ready' | 'failed' }

/**
 * What Legacy needs from the wallet. The wallet (Phase 3, built on the WebZjs tooling) provides
 * an implementation. Anything that throws is treated as a failure and reported without details.
 */
export interface LegacyWalletPort {
  /** This wallet's own receiving address, given to guardians so they can send reminders. */
  ownAddress(): Promise<string>
  /** Total network fee for a send of `memoCount` memos, plus funding a gift wallet if `fundsZat` is set. */
  estimateFee(args: { memoCount: number; fundsZat: bigint | null }): Promise<bigint>
  /**
   * A brand-new throwaway wallet to hold the gift. Its seed phrase goes inside the sealed letter,
   * with the block it was made at (if the wallet knows it) so it can be found again quickly.
   */
  createGiftWallet(): Promise<{ seed: string; address: string; birthday?: number }>
  fundGiftWallet(address: string, zat: bigint): Promise<void>
  /** Sends the memos to the recipient's address (one transaction with several outputs). */
  sendMemos(args: { to: string; memos: Uint8Array[] }): Promise<{ txid: string }>
  /** Raw memos this wallet has received. */
  receivedMemos(): Promise<Uint8Array[]>
  /** Restores the gift wallet from its seed and moves everything into this wallet. */
  sweepGiftWallet(seed: string, birthday?: number): Promise<SweepResult>
}

/** `null` until the wallet exists. Screens must handle that and say so plainly. */
export const LegacyWalletContext = createContext<LegacyWalletPort | null>(null)

export function useLegacyWallet(): LegacyWalletPort | null {
  return useContext(LegacyWalletContext)
}
