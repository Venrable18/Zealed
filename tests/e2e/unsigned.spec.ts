import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('Unsigned (recipient side; wallet not built yet)', () => {
  test('says the wallet is missing and shows the card form', async ({ page }) => {
    await page.goto('/unsigned')
    await expect(page.getByRole('heading', { level: 1, name: 'Unsigned' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'You need a wallet' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Create a contact card' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /Allow replies/ })).toBeChecked()
    // No card yet, so no inbox or share section.
    await expect(page.getByRole('heading', { name: 'Inbox' })).toHaveCount(0)
  })

  test('the form explains mistakes next to each field', async ({ page }) => {
    await page.goto('/unsigned')
    await page.getByRole('button', { name: 'Create contact card' }).click()
    await expect(page.getByText('Give the card a name.')).toBeVisible()
    await expect(page.getByText('Choose the smallest payment you will read.')).toBeVisible()
    await expect(page.getByLabel('Display name')).toHaveAttribute('aria-invalid', 'true')
  })

  test('the minimum cannot be below 0.001 ZEC or above 100 ZEC', async ({ page }) => {
    await page.goto('/unsigned')
    const minimum = page.getByLabel(/Minimum payment/)
    await minimum.fill('0.0001')
    await expect(page.getByText('That is below the minimum amount.')).toBeVisible()
    await minimum.fill('101')
    await expect(page.getByText('That is more than you can spend.')).toBeVisible()
    await minimum.fill('0.05')
    await expect(page.getByText('That is below the minimum amount.')).toBeHidden()
  })

  test('a valid card is refused honestly because there is no wallet, and nothing is created', async ({
    page,
  }) => {
    await page.goto('/unsigned')
    await page.getByLabel('Display name').fill('Ada')
    await page.getByLabel(/Short bio/).fill('Tell me what you saw.')
    await page.getByLabel(/Minimum payment/).fill('0.05')
    await page.getByRole('button', { name: 'Create contact card' }).click()
    await expect(page.getByRole('alert')).toContainText('You need a wallet first')
    await expect(page.getByRole('heading', { name: 'Your card' })).toHaveCount(0)
  })

  test('creating a card sends nothing over the network from the page', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await page.goto('/unsigned')
    await page.getByLabel('Display name').fill('Secret Source Line')
    await page.getByLabel(/Minimum payment/).fill('0.05')
    await page.getByRole('button', { name: 'Create contact card' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    for (const url of requests) expect(url).not.toContain('Secret')
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`passes accessibility checks in ${scheme} mode, with errors showing`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/unsigned')
      await page.getByRole('button', { name: 'Create contact card' }).click()
      await expect(page.getByText('Give the card a name.')).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(results.violations.map((v) => v.id)).toEqual([])
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
})
