// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Home } from './routes/Home.tsx'
import { Settings } from './routes/Settings.tsx'
import { useSettings } from './settingsStore.ts'

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().setLanguage('system')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('language', () => {
  it('follows the browser by default', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'en'], language: 'fr-FR' })
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    expect(screen.getByText('Votre tableau de bord')).toBeTruthy()
  })

  it('is English when the browser language is not offered', () => {
    vi.stubGlobal('navigator', { languages: ['de-DE'], language: 'de-DE' })
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    expect(screen.getByText('Your dashboard')).toBeTruthy()
  })

  it('changes the page at once when chosen in Settings, and is saved as a plain setting', () => {
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' })
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Español' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Español' })).toHaveProperty('checked', true)
    const saved = JSON.parse(localStorage.getItem('zealed:settings') ?? '{}') as {
      state: { language: string }
    }
    expect(saved.state.language).toBe('es')
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Idioma' })).getByRole('radio', {
        name: 'Igual que mi dispositivo',
      }),
    )
    expect(useSettings.getState().language).toBe('system')
  })

  it('offers each language by its own name, marked with its own language code', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    )
    expect(screen.getByText('Français').getAttribute('lang')).toBe('fr')
    expect(screen.getByText('English').getAttribute('lang')).toBe('en')
  })

  it('ignores a language that is not offered, and a saved one that is invalid', async () => {
    useSettings.getState().setLanguage('de' as never)
    expect(useSettings.getState().language).toBe('system')
    localStorage.setItem('zealed:settings', JSON.stringify({ state: { language: 'klingon' } }))
    await useSettings.persist.rehydrate()
    expect(useSettings.getState().language).toBe('system')
  })
})
