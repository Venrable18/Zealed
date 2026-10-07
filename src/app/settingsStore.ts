import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { parseDemoParam } from '../config/demo.ts'

interface SettingsState {
  demoMode: boolean
  setDemoMode: (demoMode: boolean) => void
}

/**
 * Non-sensitive UI preferences. They are persisted in plaintext localStorage so they are
 * available before the wallet is unlocked; nothing private may be stored here.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      demoMode: false,
      setDemoMode: (demoMode) => {
        set({ demoMode })
      },
    }),
    {
      name: 'zealed:settings',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ demoMode }) => ({ demoMode }),
    },
  ),
)

/** Applies `?demo=1` / `?demo=0` from the URL, if present. */
export function applyDemoParam(search: string): void {
  const demoMode = parseDemoParam(search)
  if (demoMode !== undefined) useSettings.getState().setDemoMode(demoMode)
}
