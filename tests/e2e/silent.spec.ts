import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const addr = (name: string) => `utest1${name.padEnd(30, 'x')}`

test.describe('Legacy: if I go silent (guardians; wallet not built yet)', () => {
  test('is reachable from the Legacy page and says the wallet is missing', async ({ page }) => {
    await page.goto('/legacy')
    await page.getByRole('link', { name: /opens only if you go silent/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'If I go silent' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'You need a wallet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check for messages' })).toBeDisabled()
    await expect(page.getByText('No letters yet')).toBeVisible()
    await expect(page.getByText('You are not guarding anyone')).toBeVisible()
    await expect(page.getByText('Nothing waiting for you')).toBeVisible()
    await expect(page.getByText(/Guardians act only when Zealed is open/)).toBeVisible()
  })

  test('the timers start at 2 minutes and 1 minute in demo mode, and 30 days and 7 days otherwise', async ({
    page,
  }) => {
    await page.goto('/legacy/silent?demo=1')
    await expect(page.getByLabel('Check in every', { exact: true })).toHaveValue('2')
    await expect(page.getByLabel('Check in every unit')).toHaveValue('minutes')
    await expect(page.getByLabel('Then wait', { exact: true })).toHaveValue('1')

    await page.goto('/legacy/silent?demo=0')
    await expect(page.getByLabel('Check in every', { exact: true })).toHaveValue('30')
    await expect(page.getByLabel('Check in every unit')).toHaveValue('days')
    await expect(page.getByLabel('Then wait', { exact: true })).toHaveValue('7')
  })

  test('the form explains mistakes next to each field', async ({ page }) => {
    await page.goto('/legacy/silent')
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByText('Enter the heir’s Zealed address.')).toBeVisible()
    await expect(page.getByText('Every guardian needs a valid Zcash address.')).toBeVisible()
    await expect(page.getByText('Write something to seal.')).toBeVisible()
  })

  test('guardians can be added up to five and removed down to two', async ({ page }) => {
    await page.goto('/legacy/silent')
    const guardians = page.getByLabel(/^Guardian \d address$/)
    await expect(guardians).toHaveCount(3)
    await page.getByRole('button', { name: 'Add a guardian' }).click()
    await page.getByRole('button', { name: 'Add a guardian' }).click()
    await expect(guardians).toHaveCount(5)
    await expect(page.getByRole('button', { name: 'Add a guardian' })).toHaveCount(0)
    for (let i = 0; i < 3; i++)
      await page
        .getByRole('button', { name: /^Remove guardian/ })
        .first()
        .click()
    await expect(guardians).toHaveCount(2)
    await expect(page.getByRole('button', { name: /^Remove guardian/ })).toHaveCount(0)
  })

  test('the heir cannot also be a guardian, and guardians must be different people', async ({
    page,
  }) => {
    await page.goto('/legacy/silent')
    await page.getByLabel(/Heir’s Zealed address/).fill(addr('heir'))
    await page.getByLabel('Guardian 1 address').fill(addr('heir'))
    await page.getByLabel('Guardian 2 address').fill(addr('two'))
    await page.getByLabel('Guardian 3 address').fill(addr('three'))
    await page.getByLabel('Your letter').fill('hello')
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByText(/heir cannot also be a guardian/)).toBeVisible()

    await page.getByLabel('Guardian 1 address').fill(addr('two'))
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByText('Each guardian must be a different person.')).toBeVisible()
  })

  test('a valid setup is refused honestly because there is no wallet, and nothing is created', async ({
    page,
  }) => {
    await page.goto('/legacy/silent')
    await page.getByLabel(/Heir’s Zealed address/).fill(addr('heir'))
    await page.getByLabel('Guardian 1 address').fill(addr('one'))
    await page.getByLabel('Guardian 2 address').fill(addr('two'))
    await page.getByLabel('Guardian 3 address').fill(addr('three'))
    await page.getByLabel('Your letter').fill('The documents are in the blue folder.')
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByRole('alert')).toContainText('You need a wallet first')
    await expect(page.getByText('No letters yet')).toBeVisible()
  })

  test('sealing sends nothing over the network from the page', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await page.goto('/legacy/silent')
    await page.getByLabel(/Heir’s Zealed address/).fill(addr('heir'))
    await page.getByLabel('Guardian 1 address').fill(addr('one'))
    await page.getByLabel('Guardian 2 address').fill(addr('two'))
    await page.getByLabel('Guardian 3 address').fill(addr('three'))
    await page.getByLabel('Your letter').fill('a private inheritance letter')
    await page.getByRole('button', { name: 'Seal and send' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    for (const url of requests) {
      expect(url).not.toContain('inheritance')
      expect(url).not.toContain('utest1')
    }
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`passes accessibility checks in ${scheme} mode, with errors and the gift field showing`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/legacy/silent')
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
