import { expect, test } from '@playwright/test'

/**
 * Runs the real WebAssembly wallet against the real Zcash testnet (NU7). Needs the wallet built
 * (`npm run wallet:build`), a network connection, and `LIVE_TESTNET=1`. Opens the app through the
 * production build, because that is what is shipped.
 */
test.skip(process.env['LIVE_TESTNET'] !== '1', 'set LIVE_TESTNET=1 to run against the testnet')
test.setTimeout(10 * 60_000)

const PASS = 'correct horse battery'

test('a new wallet opens, syncs the NU7 testnet and shows its address', async ({ page }) => {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })

  await page.goto('/settings')
  await page.getByLabel('New passphrase').first().fill(PASS)
  await page.getByLabel('Repeat the passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Save my data, encrypted' }).click()
  await expect(page.getByText('Your data is now saved on this device, encrypted.')).toBeVisible()

  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: 'Wallet' }).click()
  await page.getByRole('button', { name: 'Create a new wallet' }).click()
  await expect(page.getByTestId('seed-words').getByRole('listitem')).toHaveCount(24, {
    timeout: 5 * 60_000,
  })
  await page.getByLabel('I have written the 24 words down').check()
  await page.getByRole('button', { name: 'Create the wallet' }).click()

  await expect(page.getByTestId('spendable')).toContainText('TAZ', { timeout: 8 * 60_000 })
  await expect(page.getByText(/Up to date/)).toBeVisible({ timeout: 8 * 60_000 })

  await nav.getByRole('link', { name: 'Receive' }).click()
  const address = page.getByTestId('own-address')
  await expect(address).toHaveText(/^utest1/, { timeout: 60_000 })
  expect(problems).toEqual([])
})
