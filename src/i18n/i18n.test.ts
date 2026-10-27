import { describe, expect, it } from 'vitest'
import { en } from './en.ts'
import { CATALOGUES, LANGUAGES, isLanguageCode, resolveLanguage, translate } from './languages.ts'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('catalogues', () => {
  const keys = Object.keys(en)

  for (const { code } of LANGUAGES) {
    describe(code, () => {
      const catalogue = CATALOGUES[code] as Record<string, string>

      it('has exactly the keys English has', () => {
        expect(Object.keys(catalogue).sort()).toEqual([...keys].sort())
      })

      it('has no empty sentence', () => {
        for (const key of keys) expect(catalogue[key]?.trim(), key).toBeTruthy()
      })

      it('keeps the same {placeholders} as English', () => {
        for (const key of keys)
          expect(placeholders(catalogue[key] ?? ''), `${code} ${key}`).toEqual(
            placeholders((en as Record<string, string>)[key] ?? ''),
          )
      })

      it('does not leave the English sentence in place of a translation', () => {
        if (code === 'en') return
        const same = keys.filter(
          (key) =>
            catalogue[key] === (en as Record<string, string>)[key] &&
            // Names that really are the same in both languages.
            ![
              'contacts.title',
              'nav.contacts',
              'shell.menu',
              'landing.no',
              'landing.colZealed',
              'landing.navFaq',
              'landing.faqTitle',
              // Product names.
              'landing.floatPot',
              'landing.flowZcash',
            ].includes(key),
        )
        expect(same).toEqual([])
      })
    })
  }

  it('has a native name for every language', () => {
    expect(LANGUAGES.map((l) => l.label)).toEqual(['English', 'Español', 'Français'])
  })
})

describe('resolveLanguage', () => {
  it('uses a chosen language whatever the browser says', () => {
    expect(resolveLanguage('fr', ['es-ES'])).toBe('fr')
  })

  it('follows the first browser language we have', () => {
    expect(resolveLanguage('system', ['de-DE', 'es-MX', 'fr'])).toBe('es')
    expect(resolveLanguage('system', ['FR-ca'])).toBe('fr')
  })

  it('falls back to English', () => {
    expect(resolveLanguage('system', ['de', 'ja'])).toBe('en')
    expect(resolveLanguage('system', [])).toBe('en')
  })

  it('knows which codes exist', () => {
    expect(isLanguageCode('es')).toBe(true)
    expect(isLanguageCode('de')).toBe(false)
    expect(isLanguageCode(undefined)).toBe(false)
  })
})

describe('translate', () => {
  it('fills in placeholders', () => {
    expect(translate('es', 'contacts.saved', { name: 'Ada' })).toBe('Se guardó Ada.')
    expect(translate('fr', 'contacts.removeTitle', { name: 'Ada' })).toBe('Retirer Ada ?')
  })

  it('leaves an unknown placeholder visible rather than dropping it', () => {
    expect(translate('en', 'contacts.saved', {})).toBe('{name} was saved.')
  })

  it('does not treat a value as a pattern', () => {
    expect(translate('en', 'contacts.saved', { name: '$& {name}' })).toBe('$& {name} was saved.')
  })
})
