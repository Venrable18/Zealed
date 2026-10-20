import { useEffect } from 'react'
import { useSettings } from '../app/settingsStore.ts'
import { lockVault, useVaultStatus } from './vaultState.ts'

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
    let timer = setTimeout(() => void lockVault(), limit)

    const activity = () => {
      last = Date.now()
      clearTimeout(timer)
      timer = setTimeout(() => void lockVault(), limit)
    }
    const visible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last >= limit) void lockVault()
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
