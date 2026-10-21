import { useSettings } from '../app/settingsStore.ts'
import type { MessageKey } from './en.ts'
import { resolveLanguage, translate, type LanguageCode, type Params } from './languages.ts'

export type { MessageKey }
export { LANGUAGES, isLanguageCode, resolveLanguage, translate } from './languages.ts'
export type { LanguageCode, LanguagePreference, Params } from './languages.ts'

export type Translate = (key: MessageKey, params?: Params) => string

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  // Be careful: some environments (and tests) give a navigator with fewer fields.
  const { languages, language } = navigator as Partial<Navigator>
  return Array.isArray(languages) && languages.length > 0
    ? (languages as readonly string[])
    : typeof language === 'string'
      ? [language]
      : []
}

export function useLanguage(): LanguageCode {
  const preference = useSettings((state) => state.language)
  return resolveLanguage(preference, browserLanguages())
}

/** The translate function for the language in use. Screens re-draw when the language changes. */
export function useT(): Translate {
  const language = useLanguage()
  return (key, params) => translate(language, key, params)
}
