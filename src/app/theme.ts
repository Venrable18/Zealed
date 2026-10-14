import { useSettings, type ThemePreference } from './settingsStore.ts'

/** "system" removes the attribute so the CSS follows `prefers-color-scheme`. */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset['theme']
  else root.dataset['theme'] = theme
}

/** Applies the saved theme now and keeps it in sync with the setting. */
export function initTheme(): void {
  applyTheme(useSettings.getState().theme)
  useSettings.subscribe((state, previous) => {
    if (state.theme !== previous.theme) applyTheme(state.theme)
  })
}
