import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Card } from '../../src/features/unsigned/card.ts'
import { encodeCard } from '../../src/features/unsigned/cardLink.ts'

const card: Card = {
  name: 'Ada — tips',
  bio: 'Tell me what you saw.',
  address: 'utestcardaddress00000000000000000001',
  minimumZat: 5_000_000n,
  acceptsReplies: true,
}

const link = (value: Card) => `/u#${encodeCard(value)}`

test.describe('Unsigned (sender side; wallet not built yet)', () => {
  test('a card link shows the card, the privacy advice and the form', async ({ page }) => {
    await page.goto(link(card))
    await expect(page.getByRole('heading', { level: 1, name: 'Ada — tips' })).toBeVisible()
    await expect(page.getByText('Tell me what you saw.')).toBeVisible()
    await expect(page.getByText(/at least 0.05 ZEC/)).toBeVisible()
    await expect(page.getByText(/wallet is still being built/)).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Before you send' })).toBeVisible()
    await expect(page.getByText(/Use a separate wallet/)).toBeVisible()
    await expect(page.getByText(/Safest/)).toBeVisible()
    await expect(page.getByText('Nothing sent yet')).toBeVisible()
  })

  test('the form explains mistakes and refuses a payment below the minimum', async ({ page }) => {
    await page.goto(link(card))
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText('Write a message first.')).toBeVisible()
    await expect(page.getByText('Enter how much to pay.')).toBeVisible()
    await page.getByLabel('Payment (ZEC)').fill('0.01')
    await expect(page.getByText('That is below the minimum amount.')).toBeVisible()
  })

  test('counts the message in bytes and refuses one that is too long', async ({ page }) => {
    await page.goto(link(card))
    await page.getByLabel('Your message').fill('é'.repeat(1025))
    await expect(page.getByText(/2050 of 2048 bytes/)).toBeVisible()
    await page.getByLabel('Payment (ZEC)').fill('0.05')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText(/A message can be up to 2048 bytes/)).toBeVisible()
  })

  test('replies are off by default, and only offered when the card accepts them', async ({
    page,
  }) => {
    await page.goto(link(card))
    await expect(page.getByRole('checkbox', { name: /Allow a reply/ })).not.toBeChecked()
    await page.goto(link({ ...card, acceptsReplies: false }))
    await expect(page.getByRole('checkbox', { name: /Allow a reply/ })).toHaveCount(0)
    await expect(page.getByText(/do not accept replies/)).toBeVisible()
  })

  test('a valid message is refused honestly because there is no wallet, and nothing is listed as sent', async ({
    page,
  }) => {
    await page.goto(link(card))
    await page.getByLabel('Your message').fill('The documents are in the shed.')
    await page.getByLabel('Payment (ZEC)').fill('0.05')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByRole('alert')).toContainText('wallet is not available yet')
    await expect(page.getByText('Nothing sent yet')).toBeVisible()
  })

  test('the card and the message are never sent to the server', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await page.goto(link(card))
    await page.getByLabel('Your message').fill('a very private tip')
    await page.getByLabel('Payment (ZEC)').fill('0.05')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    for (const url of requests) {
      expect(url).not.toContain('private')
      expect(url).not.toContain('utestcardaddress')
      expect(url).not.toContain('Ada')
    }
  })

  test('a broken or missing link says so instead of showing a card', async ({ page }) => {
    for (const url of ['/u', '/u#garbage', '/u#' + 'A'.repeat(3000)]) {
      await page.goto(url)
      await expect(page.getByText('This link does not look right')).toBeVisible()
      await expect(page.getByLabel('Your message')).toHaveCount(0)
    }
  })

  test('a hostile card name and bio are shown as plain text', async ({ page }) => {
    await page.goto(
      link({
        ...card,
        name: '<img src=x onerror=alert(1)>',
        bio: '<b>bold</b> <script>alert(2)</script>',
      }),
    )
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      '<img src=x onerror=alert(1)>',
    )
    await expect(page.getByText('<b>bold</b> <script>alert(2)</script>')).toBeVisible()
    await expect(page.locator('main img')).toHaveCount(0)
    await expect(page.locator('main b')).toHaveCount(0)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`passes accessibility checks in ${scheme} mode, with errors showing`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(link(card))
      await page.getByRole('button', { name: 'Send message' }).click()
      await expect(page.getByText('Write a message first.')).toBeVisible()
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
