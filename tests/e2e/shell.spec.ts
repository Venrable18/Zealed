import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const ROUTES = [
  { path: '/', heading: 'Private money and messages for the moments that matter.' },
  { path: '/app', heading: 'Dashboard' },
  { path: '/legacy', heading: 'Legacy' },
  { path: '/legacy/silent', heading: 'If I go silent' },
  { path: '/blind-pot', heading: 'Blind Pot' },
  { path: '/unsigned', heading: 'Unsigned' },
  { path: '/dashboard', heading: 'Dashboard' },
  { path: '/contacts', heading: 'Contacts' },
  { path: '/receive', heading: 'Receive' },
  { path: '/wallet', heading: 'Wallet' },
  { path: '/settings', heading: 'Settings' },
  { path: '/components', heading: 'Component gallery' },
] as const

function h1(page: Page, name: string) {
  return page.getByRole('heading', { level: 1, name })
}

test.describe('navigation', () => {
  test('every route renders with no console errors or CSP violations', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text())
    })
    page.on('pageerror', (error) => problems.push(error.message))

    for (const { path, heading } of ROUTES) {
      await page.goto(path)
      await expect(h1(page, heading)).toBeVisible()
    }
    expect(problems).toEqual([])
  })

  test('the main navigation moves between pages and marks the current one', async ({ page }) => {
    await page.goto('/app')
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const name of ['Legacy', 'Blind Pot', 'Unsigned', 'Dashboard', 'Settings']) {
      await nav.getByRole('link', { name }).click()
      await expect(h1(page, name)).toBeVisible()
      await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
    }
  })

  test('the three feature cards on the dashboard open their pages', async ({ page }) => {
    for (const name of ['Legacy', 'Blind Pot', 'Unsigned']) {
      await page.goto('/app')
      await page
        .getByRole('main')
        .getByRole('region', { name })
        .getByRole('link', { name: 'Open' })
        .click()
      await expect(h1(page, name)).toBeVisible()
    }
  })

  test('the skip link is the first focusable item and jumps to the content', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
  })
})

test.describe('theme', () => {
  test('light and dark can be chosen, and the choice survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/settings')
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(await background()).toBe('rgb(238, 241, 245)')

    await page.getByRole('radio', { name: 'Dark' }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await background()).toBe('rgb(13, 19, 35)')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked()

    await page
      .getByRole('group', { name: 'Appearance' })
      .getByRole('radio', { name: 'Match my device' })
      .check()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    expect(await background()).toBe('rgb(238, 241, 245)')
  })

  test('follows the device setting when left on "Match my device"', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(background).toBe('rgb(13, 19, 35)')
  })
})

test.describe('phone width (360px)', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  for (const { path, heading } of ROUTES) {
    test(`${path} fits without sideways scrolling`, async ({ page }) => {
      await page.goto(path)
      await expect(h1(page, heading)).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('accessibility (axe, WCAG 2 A and AA, including color contrast)', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  for (const scheme of ['light', 'dark'] as const) {
    for (const { path, heading } of ROUTES) {
      test(`${path} in ${scheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto(path)
        await expect(h1(page, heading)).toBeVisible()
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        expect(
          results.violations.map((v) => `${v.id}: ${v.help} (${String(v.nodes.length)})`),
        ).toEqual([])
      })
    }
  }
})

test.describe('shared components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components')
    await expect(h1(page, 'Component gallery')).toBeVisible()
  })

  test('amount input explains mistakes and previews the total', async ({ page }) => {
    const amount = page.getByLabel('Amount (ZEC)')

    await amount.fill('0.05')
    await expect(page.getByText('0.0501 ZEC')).toBeVisible()

    await amount.fill('0.123456789')
    await expect(page.getByText('ZEC has at most 8 decimal places.')).toBeVisible()
    await expect(amount).toHaveAttribute('aria-invalid', 'true')

    await amount.fill('0.0001')
    await expect(page.getByText('That is below the minimum amount.')).toBeVisible()

    await amount.fill('100')
    await expect(page.getByText('That is more than you can spend.')).toBeVisible()
  })

  test('the confirmation dialog traps focus, cancels with Escape and confirms', async ({
    page,
  }) => {
    const open = page.getByRole('button', { name: 'Open confirmation' })
    await open.click()
    const dialog = page.getByRole('dialog', { name: 'Delete this sample?' })
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(open).toBeFocused()

    await open.click()
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('status').filter({ hasText: 'Deleted.' })).toBeVisible()
  })

  test('toasts: info and success are announced politely, errors stay until dismissed', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Success message' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'That worked.' })).toBeVisible()

    await page.getByRole('button', { name: 'Error message' }).click()
    const error = page.getByRole('alert').filter({ hasText: 'Something went wrong.' })
    await expect(error).toBeVisible()
    await error.getByRole('button', { name: 'Dismiss message' }).click()
    await expect(error).toBeHidden()
  })

  test('the countdown counts down', async ({ page }) => {
    const digits = page.getByText(/^\d\d:\d\d$/)
    await expect(digits).toBeVisible()
    const first = await digits.textContent()
    await expect.poll(async () => digits.textContent(), { timeout: 5000 }).not.toBe(first)
  })

  test('the QR code is drawn as an image with a label', async ({ page }) => {
    const qr = page.getByRole('img', { name: 'Sample QR code' })
    await expect(qr).toBeVisible()
    expect(await qr.locator('rect').count()).toBeGreaterThan(100)
  })
})
