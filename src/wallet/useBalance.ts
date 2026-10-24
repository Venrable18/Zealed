import { useEffect, useState } from 'react'
import { useWalletRuntime } from './runtime.ts'

/** The wallet's balance, read again whenever a sync finishes. `undefined` until first read. */
export function useBalance(): { spendableZat: bigint; pendingZat: bigint } | undefined {
  const wallet = useWalletRuntime((state) => state.wallet)
  const syncedAt = useWalletRuntime((state) => state.syncedAt)
  const [balance, setBalance] = useState<{ spendableZat: bigint; pendingZat: bigint }>()
  useEffect(() => {
    if (wallet === null) return
    let cancelled = false
    wallet.localBalance().then(
      (value) => {
        if (!cancelled) setBalance(value)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [wallet, syncedAt])
  return balance
}
