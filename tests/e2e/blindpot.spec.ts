import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('Blind Pot (host side, wallet not built yet)', () => {
  test('says the wallet is missing and still shows the form', async ({ page }) => {
    await page.goto('/blind-pot')
    await expect(page.getByRole('heading', { level: 1, name: 'Blind Pot' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'You need a wallet' })).toBeVisible()
    await expect(page.getByText('No pots yet')).toBeVisible()
    await expect(page.getByText(/refreshes only every/)).toContainText('1 hour')
  })

  test('the form explains mistakes next to each field', async ({ page }) => {
    await page.goto('/blind-pot')
    await page.getByRole('button', { name: 'Create pot' }).click()
    await expect(page.getByText('Give the pot a name.')).toBeVisible()
    await expect(page.getByText('Choose the event date.')).toBeVisible()
    await expect(page.getByText('Choose the last day for gifts.')).toBeVisible()
    await expect(page.getByLabel('Pot name')).toHaveAttribute('aria-invalid', 'true')
  })

  test('a valid form is refused honestly because there is no wallet, and nothing is created', async ({
    page,
  }) => {
    await page.goto('/blind-pot')
    await page.getByLabel('Pot name').fill('Ada and Tunde')
    await page.getByLabel('Event date').fill('2099-01-01')
    await page.getByLabel('Last day for gifts').fill('2099-02-01')
    await page.getByRole('button', { name: 'Create pot' }).click()
    await expect(page.getByRole('alert')).toContainText('You need a wallet first')
    await expect(page).toHaveURL(/\/blind-pot$/)
    await expect(page.getByText('No pots yet')).toBeVisible()
  })

  test('demo mode shortens the refresh interval shown to the host', async ({ page }) => {
    await page.goto('/blind-pot?demo=1')
    await expect(page.getByText(/refreshes only every/)).toContainText('1 minute')
  })

  test('an unknown pot says so instead of showing anything', async ({ page }) => {
    await page.goto('/blind-pot/0123456789abcdef0123456789abcdef')
    await expect(page.getByText('Pot not found')).toBeVisible()
    await page.getByRole('link', { name: 'Back to Blind Pot' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Blind Pot' })).toBeVisible()
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`the not-found pot page passes accessibility checks in ${scheme} mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/blind-pot/unknown')
      await expect(page.getByText('Pot not found')).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(results.violations.map((v) => v.id)).toEqual([])
    })
  }

  test('the form passes accessibility checks with errors showing', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/blind-pot')
    await page.getByRole('button', { name: 'Create pot' }).click()
    await expect(page.getByText('Give the pot a name.')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations.map((v) => v.id)).toEqual([])
  })
})
