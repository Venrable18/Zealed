import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const RECIPIENT = 'utest1recipientaddressrecipientaddress'

test.describe('Legacy (letters sealed until a date; wallet not built yet)', () => {
  test('says the wallet is missing and still shows the form, inbox and sent list', async ({
    page,
  }) => {
    await page.goto('/legacy')
    await expect(page.getByRole('heading', { level: 1, name: 'Legacy' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'You need a wallet' })).toBeVisible()
    await expect(page.getByText('No sealed letters')).toBeVisible()
    await expect(page.getByText('Nothing sealed yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check for sealed letters' })).toBeDisabled()
  })

  test('the form explains mistakes next to each field', async ({ page }) => {
    await page.goto('/legacy')
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByText('Enter the recipient’s Zealed address.')).toBeVisible()
    await expect(page.getByText('Write something to seal.')).toBeVisible()
    await expect(page.getByLabel(/Recipient/)).toHaveAttribute('aria-invalid', 'true')
  })

  test('counts the letter in bytes and refuses one that is too long', async ({ page }) => {
    await page.goto('/legacy')
    await page.getByLabel(/Recipient/).fill(RECIPIENT)
    await page.getByLabel('Your letter').fill('é'.repeat(1025))
    await expect(page.getByText(/2050 of 2048 bytes/)).toBeVisible()
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByText(/A letter can be up to 2048 bytes/)).toBeVisible()
  })

  test('a valid letter is refused honestly because there is no wallet, and nothing is listed as sent', async ({
    page,
  }) => {
    await page.goto('/legacy')
    await page.getByLabel(/Recipient/).fill(RECIPIENT)
    await page.getByLabel('Your letter').fill('See you on the other side.')
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByRole('alert')).toContainText('You need a wallet first')
    await expect(page.getByText('Nothing sealed yet')).toBeVisible()
  })

  test('a gift amount field appears on request and has its own checks', async ({ page }) => {
    await page.goto('/legacy')
    await expect(page.getByLabel('Gift amount (ZEC)')).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Include ZEC with the letter' }).check()
    const amount = page.getByLabel('Gift amount (ZEC)')
    await amount.fill('0.0001')
    await expect(page.getByText('That is below the minimum amount.')).toBeVisible()
    await amount.fill('0.25')
    await expect(page.getByText('That is below the minimum amount.')).toBeHidden()
  })

  test('the unlock time starts 30 seconds ahead in demo mode, and about a year ahead otherwise', async ({
    page,
  }) => {
    const unlockMs = async () =>
      page
        .getByLabel('Open on')
        .evaluate((input) => new Date((input as HTMLInputElement).value).getTime() - Date.now())

    await page.goto('/legacy?demo=1')
    await expect(page.getByText('Demo mode: it starts 30 seconds from now.')).toBeVisible()
    expect(await unlockMs()).toBeGreaterThan(20_000)
    expect(await unlockMs()).toBeLessThan(40_000)

    await page.goto('/legacy?demo=0')
    const year = 365 * 24 * 60 * 60 * 1000
    expect(await unlockMs()).toBeGreaterThan(year - 60_000)
    expect(await unlockMs()).toBeLessThan(year + 60_000)
  })

  test('an unlock time in the past is refused', async ({ page }) => {
    await page.goto('/legacy')
    await page.getByLabel(/Recipient/).fill(RECIPIENT)
    await page.getByLabel('Your letter').fill('hello')
    await page.getByLabel('Open on').fill('2020-01-01T00:00')
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByText(/Choose a time at least 15 seconds from now/)).toBeVisible()
  })

  test('sealing sends nothing over the network from the page', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await page.goto('/legacy')
    await page.getByLabel(/Recipient/).fill(RECIPIENT)
    await page.getByLabel('Your letter').fill('a private letter')
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    for (const url of requests) {
      expect(url).not.toContain('private')
      expect(url).not.toContain(RECIPIENT)
    }
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`passes accessibility checks in ${scheme} mode, with the gift field and errors showing`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/legacy')
      await page.getByRole('checkbox', { name: 'Include ZEC with the letter' }).check()
      await page.getByRole('button', { name: 'Seal and send' }).click()
      await expect(page.getByText('Write something to seal.')).toBeVisible()
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
