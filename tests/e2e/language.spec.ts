import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const h1 = (page: Page, name?: string) =>
  page.getByRole('heading', { level: 1, ...(name === undefined ? {} : { name }) })

test.describe('browser language is French', () => {
  test.use({ locale: 'fr-FR' })

  test('follows the browser until one is chosen, and the choice survives a reload', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(h1(page, 'Réglages')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')

    await page.getByRole('radio', { name: 'Español' }).check()
    await expect(h1(page, 'Ajustes')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')

    await page.reload()
    await expect(h1(page, 'Ajustes')).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Español' })).toBeChecked()

    await page.getByRole('radio', { name: 'English' }).check()
    await expect(h1(page, 'Settings')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})

test.describe('browser language is not offered', () => {
  test.use({ locale: 'ja-JP' })

  test('shows English', async ({ page }) => {
    await page.goto('/app')
    await expect(page.getByText('Your dashboard')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})

test.describe('browser language is Spanish', () => {
  test.use({ locale: 'es-ES' })

  test('the navigation and contacts change language; feature names do not', async ({ page }) => {
    await page.goto('/app')
    const nav = page.getByRole('navigation', { name: 'Principal' })
    await expect(nav.getByRole('link', { name: 'Ajustes' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Legacy' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Blind Pot' })).toBeVisible()
    await nav.getByRole('link', { name: 'Contactos' }).click()
    await expect(h1(page, 'Contactos')).toBeVisible()
    await page.getByLabel('Nombre', { exact: true }).fill('Ada')
    await page.getByLabel('Dirección', { exact: true }).fill('utest1adaaddressadaaddressadaaddress')
    await page.getByRole('button', { name: 'Guardar contacto' }).click()
    await expect(page.getByText('Se guardó Ada.')).toBeVisible()
  })
})

for (const locale of ['es-ES', 'fr-FR'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`phone width and accessibility, ${locale}, ${scheme}`, () => {
      test.use({ locale, colorScheme: scheme, viewport: { width: 360, height: 740 } })
      for (const path of ['/', '/app', '/settings', '/contacts', '/receive']) {
        test(path, async ({ page }) => {
          await page.goto(path)
          await expect(h1(page)).toBeVisible()
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          expect(overflow).toBeLessThanOrEqual(0)
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
          expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
        })
      }
    })
  }
}
