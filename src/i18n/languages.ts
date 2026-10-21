import { en, type MessageKey } from './en.ts'
import { es } from './es.ts'
import { fr } from './fr.ts'

export const LANGUAGES = [
  { code: 'en', label: en['lang.name'] },
  { code: 'es', label: es['lang.name'] },
  { code: 'fr', label: fr['lang.name'] },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']
/** A chosen language, or "system" to follow the browser. */
export type LanguagePreference = 'system' | LanguageCode

export const CATALOGUES: Record<LanguageCode, Record<MessageKey, string>> = { en, es, fr }

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  LANGUAGES.some(({ code }) => code === value)

/** The language to show: the chosen one, or the first browser language we have, or English. */
export function resolveLanguage(
  preference: LanguagePreference,
  browserLanguages: readonly string[],
): LanguageCode {
  if (preference !== 'system') return preference
  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLanguageCode(base)) return base
  }
  return 'en'
}

export type Params = Record<string, string | number>

/** Looks up a sentence and fills in its {placeholders}. Falls back to English, never to a key. */
export function translate(language: LanguageCode, key: MessageKey, params?: Params): string {
  const text = CATALOGUES[language][key] || en[key]
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name]
    return value === undefined ? whole : String(value)
  })
}
