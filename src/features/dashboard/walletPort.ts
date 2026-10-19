import { createContext, useContext } from 'react'

/** What the dashboard needs from the wallet: the balance, read from the wallet's own local data. */
export interface DashboardWalletPort {
  balance(): Promise<{ spendableZat: bigint; pendingZat: bigint }>
}

/** `null` until the wallet exists. */
export const DashboardWalletContext = createContext<DashboardWalletPort | null>(null)

export function useDashboardWallet(): DashboardWalletPort | null {
  return useContext(DashboardWalletContext)
}
