import { expect, test, type Page } from '@playwright/test'
import { LIGHTWALLET_ENDPOINTS } from '../../src/config/network.ts'

const ENDPOINT = LIGHTWALLET_ENDPOINTS[0]?.url ?? ''
const enc = new TextEncoder()
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => Array.from(p)))
const str = (field: number, text: string) =>
  concat(Uint8Array.of((field << 3) | 2, enc.encode(text).length), enc.encode(text))
const varint = (field: number, value: number) => {
  const bytes: number[] = [field << 3]
  let v = value
  while (v >= 0x80) {
    bytes.push((v % 0x80) | 0x80)
    v = Math.floor(v / 0x80)
  }
  bytes.push(v)
  return Uint8Array.from(bytes)
}
const frame = (flag: number, payload: Uint8Array) =>
  concat(Uint8Array.of(flag, 0, 0, 0, payload.length), payload)

/** A canned light-wallet reply, with the CORS headers a browser needs, so no internet is used. */
async function mockServer(page: Page, chain: string, seen: string[]) {
  const reply = concat(
    frame(0, concat(str(1, 'v0.5.4'), str(4, chain), str(6, '77190ad9'), varint(7, 4_519_623))),
    frame(0x80, enc.encode('grpc-status:0\r\n')),
  )
  await page.route(`${ENDPOINT}/**`, async (route) => {
    const request = route.request()
    seen.push(request.method())
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,x-grpc-web,x-user-agent,grpc-timeout',
      'access-control-expose-headers': 'grpc-status,grpc-message',
    }
    if (request.method() === 'OPTIONS') await route.fulfill({ status: 204, headers: cors })
    else
      await route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/grpc-web+proto' },
        body: Buffer.from(reply),
      })
  })
}

test.describe('Settings', () => {
  test('shows every section', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('Light-wallet server', { exact: true })).toBeVisible()
    for (const name of ['Settings', 'Demo mode', 'Seed phrase', 'Local data']) {
      await expect(page.getByRole('heading', { name })).toBeVisible()
    }
    await expect(page.getByLabel('Lock after')).toHaveValue('5')
    await expect(page.getByText(/no seed phrase to show/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show seed phrase' })).toBeDisabled()
  })

  test('the auto-lock time is saved and survives a reload, and has no "never"', async ({
    page,
  }) => {
    await page.goto('/settings')
    const options = await page.getByLabel('Lock after').locator('option').allTextContents()
    expect(options).toHaveLength(5)
    expect(options.join(' ')).not.toMatch(/never/i)
    await page.getByLabel('Lock after').selectOption('30')
    await page.reload()
    await expect(page.getByLabel('Lock after')).toHaveValue('30')
  })

  test('a tampered saved server cannot point the app at an unlisted address', async ({ page }) => {
    await page.goto('/settings')
    await page.evaluate(() => {
      localStorage.setItem(
        'zealed:settings',
        JSON.stringify({
          state: { endpointUrl: 'https://evil.example/x', autoLockMinutes: 0 },
          version: 0,
        }),
      )
    })
    await page.reload()
    await expect(page.getByRole('radio').first()).toBeChecked()
    await expect(page.getByLabel('Lock after')).toHaveValue('5')
  })

  test('the server check runs only when asked, and reports a healthy testnet server (mocked, so no internet)', async ({
    page,
  }) => {
    const seen: string[] = []
    await mockServer(page, 'test', seen)
    await page.goto('/settings')
    await page.waitForTimeout(800)
    expect(seen).toEqual([])
    await page.getByRole('button', { name: /^Check / }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Working.' })).toContainText(
      'Testnet, block 4,519,623, network upgrade NU7 (77190ad9)',
    )
    expect(seen).toContain('POST')
  })

  test('a server on the wrong network is refused', async ({ page }) => {
    await mockServer(page, 'main', [])
    await page.goto('/settings')
    await page.getByRole('button', { name: /^Check / }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'not a testnet server' })).toBeVisible()
  })

  test('an unreachable server says so', async ({ page }) => {
    await page.route(`${ENDPOINT}/**`, (route) => route.abort('connectionrefused'))
    await page.goto('/settings')
    await page.getByRole('button', { name: /^Check / }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Could not connect' })).toBeVisible()
  })

  test('wiping needs the exact word, then removes saved settings, databases and session data and returns to the start', async ({
    page,
  }) => {
    await page.goto('/settings?demo=1')
    await page.getByRole('radio', { name: 'Dark' }).check()
    await page.getByLabel('Lock after').selectOption('15')
    await page.evaluate(async () => {
      sessionStorage.setItem('zealed:session', 'x')
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('zealed-test-db', 1)
        request.onsuccess = () => {
          request.result.close()
          resolve()
        }
        request.onerror = () => {
          reject(new Error('open failed'))
        }
      })
    })
    expect(await page.evaluate(() => localStorage.length)).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Wipe all local data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Wipe all local data?' })
    await dialog.getByRole('button', { name: 'Wipe everything' }).click()
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => localStorage.length)).toBeGreaterThan(0)

    await dialog.getByLabel('Type WIPE').fill('WIPE')
    await dialog.getByRole('button', { name: 'Wipe everything' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Zealed' })).toBeVisible()
    const left = await page.evaluate(async () => ({
      local: Object.keys(localStorage).filter((key) => key !== 'zealed:settings'),
      session: sessionStorage.length,
      databases: (await indexedDB.databases()).map((db) => db.name),
      theme: document.documentElement.dataset['theme'] ?? 'system',
    }))
    expect(left).toEqual({ local: [], session: 0, databases: [], theme: 'system' })
    await page.goto('/settings')
    await expect(page.getByLabel('Lock after')).toHaveValue('5')
    await expect(page.getByRole('radio', { name: 'Match my device' })).toBeChecked()
  })
})

// Needs the internet: run with LIVE_DRAND=1 (see `npm run test:live`). It proves a real browser can
// talk to the real testnet server under the page's security headers.
test.describe('Settings against the real testnet server', () => {
  test.skip(process.env['LIVE_DRAND'] !== '1', 'needs the internet; set LIVE_DRAND=1')

  test('the real server answers a check from the browser', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') violations.push(message.text())
    })
    await page.goto('/settings')
    await page.getByRole('button', { name: /^Check / }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Working.' })).toContainText(
      'Testnet, block',
      { timeout: 20_000 },
    )
    expect(violations).toEqual([])
  })
})
