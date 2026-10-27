import { useEffect } from 'react'
import { useSettings } from '../app/settingsStore.ts'
import { useWalletRuntime } from '../wallet/runtime.ts'
import { isWorking } from './inflight.ts'
import { lockVault, useVaultStatus } from './vaultState.ts'

/** How often to try again when the wallet is busy at the moment the lock is due. */
const BUSY_RETRY_MS = 5_000

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

/**
 * Locks the vault after a period with no use. Timers in a background tab are slow, so the time
 * since the last activity is also checked when the page becomes visible again.
 */
export function useAutoLock(): void {
  const status = useVaultStatus((state) => state.status)
  const minutes = useSettings((state) => state.autoLockMinutes)

  useEffect(() => {
    if (status !== 'unlocked') return
    const limit = minutes * 60_000
    let last = Date.now()
    // Locking closes the wallet. Never in the middle of a send: a letter's gift could be funded and
    // the letter itself never sent. So a lock that falls due while the wallet is busy waits for it.
    const lock = () => {
      if (useWalletRuntime.getState().wallet?.busy === true || isWorking()) {
        clearTimeout(timer)
        timer = setTimeout(lock, BUSY_RETRY_MS)
        return
      }
      void lockVault()
    }
    let timer = setTimeout(lock, limit)

    const activity = () => {
      last = Date.now()
      clearTimeout(timer)
      timer = setTimeout(lock, limit)
    }
    const visible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last >= limit) lock()
    }

    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, activity, { passive: true })
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearTimeout(timer)
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, activity)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [status, minutes])
}
