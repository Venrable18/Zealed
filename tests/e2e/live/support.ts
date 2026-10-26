import { readFileSync } from 'node:fs'
import { expect, type Browser, type Page } from '@playwright/test'

/**
 * Helpers for the tests that run the real wallet on the real Zcash testnet (NU7). They need the
 * wallet built (`npm run wallet:build`) and, for anything that pays, a funded testnet seed in the file
 * named by `LIVE_TESTNET_SEED_FILE` with that wallet's birthday in `LIVE_TESTNET_BIRTHDAY`.
 */
export const SEED_FILE = process.env['LIVE_TESTNET_SEED_FILE']
export const FUNDED = SEED_FILE !== undefined
const PASS = 'correct horse battery'
/** Long enough for several 25-second blocks and confirmations. */
export const BLOCKS = 10 * 60_000

export async function newPage(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  page.on('pageerror', (error) => {
    throw error
  })
  return page
}

export const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()

/** Keeps data in the vault (which the wallet needs), and turns on demo mode if asked. Always the first step. */
export async function setUp(page: Page, { demo = false }: { demo?: boolean } = {}) {
  await page.goto('/settings')
  if (demo) await page.getByRole('checkbox', { name: /Shorten timers/ }).check()
  // These tests sit waiting for blocks for minutes with no input; the default would lock the app.
  await page.getByLabel('Lock after').selectOption('60')
  await page.getByLabel('New passphrase').first().fill(PASS)
  await page.getByLabel('Repeat the passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Save my data, encrypted' }).click()
  await expect(page.getByText('Your data is now saved on this device, encrypted.')).toBeVisible()
}

/** Creates a wallet and returns its recovery phrase, so test money sent to it can be recovered. */
export async function createWallet(page: Page): Promise<string> {
  await nav(page, 'Wallet')
  await page.getByRole('button', { name: 'Create a new wallet' }).click()
  const words = page.getByTestId('seed-words').getByRole('listitem')
  await expect(words).toHaveCount(24, { timeout: 5 * 60_000 })
  const phrase = (await words.allTextContents())
    .map((word) => word.replace(/^\s*\d+\.?\s*/, '').trim())
    .join(' ')
  await page.getByLabel('I have written the 24 words down').check()
  await page.getByRole('button', { name: 'Create the wallet' }).click()
  await expect(page.getByText(/Up to date/)).toBeVisible({ timeout: BLOCKS })
  return phrase
}

/** Restores a wallet from its phrase and waits until it has spendable money. */
export async function restoreWallet(page: Page, phrase: string, birthday: string) {
  await nav(page, 'Wallet')
  await page.getByLabel('Recovery phrase').fill(phrase)
  await page.getByLabel('Starting block (optional)').fill(birthday)
  await page.getByRole('button', { name: 'Restore this wallet' }).click()
  await expect(page.getByText(/Up to date/)).toBeVisible({ timeout: BLOCKS })
  await expect(page.getByTestId('spendable')).not.toHaveText(/^0 TAZ$/, { timeout: 60_000 })
}

export async function restoreFundedWallet(page: Page) {
  await restoreWallet(
    page,
    readFileSync(SEED_FILE ?? '', 'utf8').trim(),
    process.env['LIVE_TESTNET_BIRTHDAY'] ?? '',
  )
}

/** The wallet's address, from the Receive page. */
export async function ownAddress(page: Page): Promise<string> {
  await nav(page, 'Receive')
  const address = page.getByTestId('own-address')
  await expect(address).toHaveText(/^utest1/, { timeout: 60_000 })
  return (await address.textContent()) ?? ''
}

/** Opens a link inside the running app, so the unlocked vault and wallet stay open. */
export async function openInApp(page: Page, link: string) {
  const url = new URL(link)
  await page.evaluate((path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, url.pathname + url.hash)
}
