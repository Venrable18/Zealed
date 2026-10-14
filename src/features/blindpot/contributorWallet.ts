import { createContext, useContext } from 'react'

export type SendPieceResult =
  | { ok: true; txid: string }
  /** The change from the last piece is not spendable yet. Try again shortly. */
  | { ok: false; reason: 'not-spendable-yet' }
  | { ok: false; reason: 'insufficient-funds' }
  | { ok: false; reason: 'failed' }

/**
 * What a guest's gift needs from the wallet. The wallet (Phase 3) provides it. Each call sends
 * one shielded transaction to one address, with an optional memo.
 */
export interface ContributorWalletPort {
  /** Zatoshis the wallet can spend right now. */
  spendableZat(): Promise<bigint>
  sendPiece(args: { address: string; zat: bigint; memo?: Uint8Array }): Promise<SendPieceResult>
}

/** `null` until the wallet exists. */
export const ContributorWalletContext = createContext<ContributorWalletPort | null>(null)

export function useContributorWallet(): ContributorWalletPort | null {
  return useContext(ContributorWalletContext)
}
