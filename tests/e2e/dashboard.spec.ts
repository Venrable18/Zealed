import { expect, test, type Page } from '@playwright/test'
import { allowedConnectOrigins } from '../../src/config/network.ts'

/**
 * The page's own code files are downloaded from the app's server (the dashboard is loaded on demand).
 * That is not the dashboard using the network: it is fetching the program itself, with no data of
 * the user's. Everything else must be zero: no other origin, no light-wallet or drand server, no
 * POST, no beacons, no calls to any API path.
 */
function isOwnCode(url: string, own: string): boolean {
  const { origin, pathname } = new URL(url)
  return (
    origin === own &&
    (pathname.startsWith('/assets/') ||
      pathname.startsWith('/src/') ||
      pathname.startsWith('/node_modules/') ||
      pathname.startsWith('/@'))
  )
}

function watch(page: Page) {
  const seen: { method: string; url: string }[] = []
  page.on('request', (request) => seen.push({ method: request.method(), url: request.url() }))
  return seen
}

test.describe('Dashboard', () => {
  test('says it is computed on this device and shows every section', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('note')).toHaveText(
      'Your dashboard is computed on this device. We can’t see it.',
    )
    for (const name of ['Wallet', 'Blind Pot', 'Legacy', 'Unsigned'])
      await expect(page.getByRole('region', { name })).toBeVisible()
    await expect(
      page.getByText(/wallet is not available yet, so there is no balance/),
    ).toBeVisible()
    await expect(page.getByText('No pots yet.')).toBeVisible()
    await expect(page.getByText('None yet')).toBeVisible()
  })

  test('opened from inside the app, it fetches only its own code and makes no other request', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Zealed' })).toBeVisible()
    const own = new URL(baseURL ?? '').origin

    const seen = watch(page)
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Dashboard' })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await page.getByRole('button', { name: 'Refresh' }).click()
    await page.waitForTimeout(1500)

    const others = seen.filter((request) => !isOwnCode(request.url, own))
    expect(others).toEqual([])
    expect(seen.every((request) => request.method === 'GET')).toBe(true)
  })

  test('never talks to a light-wallet server or drand', async ({ page, baseURL }) => {
    const seen = watch(page)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await page.waitForTimeout(1500)
    const own = new URL(baseURL ?? '').origin
    for (const { url } of seen) {
      expect(new URL(url).origin).toBe(own)
      expect(allowedConnectOrigins()).not.toContain(new URL(url).origin)
    }
  })

  test('once loaded, refreshing and waiting produce no requests at all', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await page.waitForTimeout(500)
    const seen = watch(page)
    await page.getByRole('button', { name: 'Refresh' }).click()
    await page.waitForTimeout(2500)
    expect(seen).toEqual([])
  })
})
