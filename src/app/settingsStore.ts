import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { parseDemoParam } from '../config/demo.ts'

export type ThemePreference = 'system' | 'light' | 'dark'

interface SettingsState {
  demoMode: boolean
  setDemoMode: (demoMode: boolean) => void
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
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
      theme: 'system',
      setTheme: (theme) => {
        set({ theme })
      },
    }),
    {
      name: 'zealed:settings',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ demoMode, theme }) => ({ demoMode, theme }),
    },
  ),
)

/** Applies `?demo=1` / `?demo=0` from the URL, if present. */
export function applyDemoParam(search: string): void {
  const demoMode = parseDemoParam(search)
  if (demoMode !== undefined) useSettings.getState().setDemoMode(demoMode)
}
