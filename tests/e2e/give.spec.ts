import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { encodeShare, type SharedPot } from '../../src/features/blindpot/shareLink.ts'

const pot: SharedPot = {
  id: 'e'.repeat(32),
  name: 'Ada and Tunde',
  cover: '🎁',
  eventDate: '2099-01-01',
  endDate: '2099-02-01',
  address: 'utest1fakeaddressfakeaddressfakeaddress',
}

const link = (value: SharedPot) => `/blind-pot/give#pot=${encodeShare(value)}`

test.describe('Blind Pot (guest side, wallet not built yet)', () => {
  test('a pot link shows the pot, and the gift preview works', async ({ page }) => {
    await page.goto(link(pot))
    await expect(page.getByRole('heading', { level: 1, name: /Ada and Tunde/ })).toBeVisible()
    await expect(page.getByText('Event 2099-01-01. Gifts until 2099-02-01.')).toBeVisible()
    await expect(page.getByText(/wallet is still being built/)).toBeVisible()

    await page.getByLabel('Gift amount (ZEC)').fill('0.05')
    await expect(page.getByText(/You will send/)).toContainText('0.05 ZEC in 1 piece')

    await page.getByLabel(/A wish for the host/).fill('Congratulations!')
    await expect(page.getByText(/You will send/)).toContainText('0.05 ZEC in 6 pieces')

    await page.getByLabel('Gift amount (ZEC)').fill('0.5')
    await expect(page.getByText(/You will send/)).toContainText('0.501 ZEC in 2 pieces')
    await expect(page.getByText(/Rounded from 0.5 ZEC/)).toBeVisible()
  })

  test('asks before sending, then says plainly that nothing can be sent without a wallet', async ({
    page,
  }) => {
    await page.goto(link(pot))
    await page.getByLabel('Gift amount (ZEC)').fill('0.05')
    await page.getByRole('button', { name: 'Send gift' }).click()
    await expect(page.getByRole('alert')).toContainText('wallet is not available yet')
    await expect(page.getByText('Thank you')).toBeHidden()
  })

  test('explains a wish that is too long and blocks sending', async ({ page }) => {
    await page.goto(link(pot))
    await page.getByLabel('Gift amount (ZEC)').fill('0.05')
    await page.getByLabel(/A wish for the host/).fill('a'.repeat(141))
    await expect(page.getByText('Keep your wish to 140 characters or fewer.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send gift' })).toBeDisabled()
  })

  test('the pot data stays in the URL fragment and is never requested from the server', async ({
    page,
  }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await page.goto(link(pot))
    await expect(page.getByRole('heading', { level: 1, name: /Ada and Tunde/ })).toBeVisible()
    for (const url of requests) expect(url).not.toContain('utest1')
    for (const url of requests) expect(url).not.toContain('Ada')
  })

  test('a broken or missing link says so instead of showing a pot', async ({ page }) => {
    for (const url of [
      '/blind-pot/give',
      '/blind-pot/give#pot=garbage',
      '/blind-pot/give#pot=' + 'A'.repeat(3000),
    ]) {
      await page.goto(url)
      await expect(page.getByText('This link does not look right')).toBeVisible()
      await expect(page.getByLabel('Gift amount (ZEC)')).toHaveCount(0)
    }
  })

  test('a pot past its last day does not take gifts', async ({ page }) => {
    await page.goto(link({ ...pot, endDate: '2020-01-01' }))
    await expect(page.getByText(/closed to gifts/)).toBeVisible()
    await expect(page.getByLabel('Gift amount (ZEC)')).toHaveCount(0)
  })

  test('a hostile pot name is shown as plain text', async ({ page }) => {
    await page.goto(link({ ...pot, name: '<img src=x onerror=alert(1)>' }))
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      '<img src=x onerror=alert(1)>',
    )
    await expect(page.locator('main img')).toHaveCount(0)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`the gift page passes accessibility checks in ${scheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(link(pot))
      await page.getByLabel('Gift amount (ZEC)').fill('0.5')
      await page.getByLabel(/A wish for the host/).fill('Best wishes')
      await expect(page.getByText(/You will send/)).toBeVisible()
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
