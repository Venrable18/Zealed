import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { parseDemoParam } from '../config/demo.ts'
import { LIGHTWALLET_ENDPOINTS } from '../config/network.ts'
import { isLanguageCode, type LanguagePreference } from '../i18n/languages.ts'

export type ThemePreference = 'system' | 'light' | 'dark'

/** Minutes of inactivity before the wallet locks. There is deliberately no "never". */
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60] as const
export const DEFAULT_AUTO_LOCK_MINUTES = 5

const DEFAULT_ENDPOINT_URL = LIGHTWALLET_ENDPOINTS[0]?.url ?? ''

interface SettingsState {
  demoMode: boolean
  setDemoMode: (demoMode: boolean) => void
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
  /** The light-wallet server to use. Always one of the configured endpoints. */
  endpointUrl: string
  setEndpointUrl: (url: string) => void
  autoLockMinutes: number
  setAutoLockMinutes: (minutes: number) => void
  /** The language of the translated screens, or "system" to follow the browser. */
  language: LanguagePreference
  setLanguage: (language: LanguagePreference) => void
}

const isEndpoint = (url: unknown): url is string =>
  LIGHTWALLET_ENDPOINTS.some((endpoint) => endpoint.url === url)
const isAutoLock = (minutes: unknown): minutes is number =>
  AUTO_LOCK_OPTIONS.some((option) => option === minutes)

/**
 * Non-sensitive UI preferences. They are persisted in plaintext localStorage so they are
 * available before the wallet is unlocked; nothing private may be stored here. Saved values are
 * checked when loaded, so edited storage cannot point the app at an unlisted server.
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
      endpointUrl: DEFAULT_ENDPOINT_URL,
      setEndpointUrl: (url) => {
        if (isEndpoint(url)) set({ endpointUrl: url })
      },
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      setAutoLockMinutes: (minutes) => {
        if (isAutoLock(minutes)) set({ autoLockMinutes: minutes })
      },
      language: 'system',
      setLanguage: (language) => {
        if (language === 'system' || isLanguageCode(language)) set({ language })
      },
    }),
    {
      name: 'zealed:settings',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ demoMode, theme, endpointUrl, autoLockMinutes, language }) => ({
        demoMode,
        theme,
        endpointUrl,
        autoLockMinutes,
        language,
      }),
      merge: (saved, current) => {
        const s = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<
          string,
          unknown
        >
        return {
          ...current,
          demoMode: s['demoMode'] === true,
          theme: s['theme'] === 'light' || s['theme'] === 'dark' ? s['theme'] : 'system',
          endpointUrl: isEndpoint(s['endpointUrl']) ? s['endpointUrl'] : DEFAULT_ENDPOINT_URL,
          autoLockMinutes: isAutoLock(s['autoLockMinutes'])
            ? s['autoLockMinutes']
            : DEFAULT_AUTO_LOCK_MINUTES,
          language: isLanguageCode(s['language']) ? s['language'] : 'system',
        }
      },
    },
  ),
)

/** Applies `?demo=1` / `?demo=0` from the URL, if present. */
export function applyDemoParam(search: string): void {
  const demoMode = parseDemoParam(search)
  if (demoMode !== undefined) useSettings.getState().setDemoMode(demoMode)
}
