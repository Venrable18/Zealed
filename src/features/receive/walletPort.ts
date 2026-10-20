import { createContext, useContext } from 'react'

/** What the Receive screen needs from the wallet. The wallet (Phase 3) provides it. */
export interface ReceiveWalletPort {
  /** The wallet's main receiving address. */
  ownAddress(): Promise<string>
  /** A new address, so each person can be given a different one. */
  newAddress(): Promise<string>
}

/** `null` until the wallet exists. */
export const ReceiveWalletContext = createContext<ReceiveWalletPort | null>(null)

export function useReceiveWallet(): ReceiveWalletPort | null {
  return useContext(ReceiveWalletContext)
}
