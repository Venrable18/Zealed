import { createContext, useContext } from 'react'

/** One transaction the wallet received at the card's address. */
export interface ReceivedTx {
  txid: string
  /** Block time (Unix ms). */
  receivedAtMs: number
  /** Total value received at the card's address in this transaction. */
  amountZat: bigint
  /** The raw 512-byte memos of its outputs to that address. */
  memos: Uint8Array[]
}

/**
 * What Unsigned needs from the wallet. The wallet (Phase 3, built on the WebZjs tooling) provides
 * it. Anything that throws is treated as a failure and reported without details.
 */
export interface UnsignedWalletPort {
  /** A fresh receiving address, used for one contact card so its payments can be told apart. */
  newAddress(): Promise<string>
  /** Transactions received at `address`, each with its amount, block time and memos. */
  receivedTransactions(address: string): Promise<ReceivedTx[]>
  /** Total network fee for sending `memoCount` memos. */
  estimateFee(args: { memoCount: number }): Promise<bigint>
  sendMemos(args: { to: string; memos: Uint8Array[] }): Promise<{ txid: string }>
}

/** `null` until the wallet exists. Screens must handle that and say so plainly. */
export const UnsignedWalletContext = createContext<UnsignedWalletPort | null>(null)

export function useUnsignedWallet(): UnsignedWalletPort | null {
  return useContext(UnsignedWalletContext)
}
