import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Unsigned, end to end, on the real Zcash testnet (NU7), with the real wallet in two separate
 * browsers: a recipient with a brand-new wallet publishes a card; a sender with a funded wallet
 * pays and writes; the recipient reads it, then replies (paid from what the sender sent); the sender
 * finds the reply. Needs the wallet built and a funded seed (`LIVE_TESTNET_SEED_FILE`, with its
 * birthday in `LIVE_TESTNET_BIRTHDAY`). Spends 0.001 TAZ plus fees each run.
 */
const seedFile = process.env['LIVE_TESTNET_SEED_FILE']
test.skip(seedFile === undefined, 'set LIVE_TESTNET_SEED_FILE to a funded testnet seed')
test.setTimeout(20 * 60_000)

const PASS = 'correct horse battery'
const BLOCKS = 10 * 60_000

async function newPage(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  page.on('pageerror', (error) => {
    throw error
  })
  return page
}

async function withVault(page: Page) {
  await page.goto('/settings')
  await page.getByLabel('New passphrase').first().fill(PASS)
  await page.getByLabel('Repeat the passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Save my data, encrypted' }).click()
  await expect(page.getByText('Your data is now saved on this device, encrypted.')).toBeVisible()
}

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()

test('Unsigned on the NU7 testnet: pay and write, read, reply, read the reply', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const recipient = await newPage(browser, baseURL)
  const sender = await newPage(browser, baseURL)

  // The recipient makes a new wallet.
  await withVault(recipient)
  await nav(recipient, 'Wallet')
  await recipient.getByRole('button', { name: 'Create a new wallet' }).click()
  await expect(recipient.getByTestId('seed-words').getByRole('listitem')).toHaveCount(24, {
    timeout: 5 * 60_000,
  })
  await recipient.getByLabel('I have written the 24 words down').check()
  await recipient.getByRole('button', { name: 'Create the wallet' }).click()
  await expect(recipient.getByText(/Up to date/)).toBeVisible({ timeout: BLOCKS })

  // The sender restores the funded wallet.
  await withVault(sender)
  await nav(sender, 'Wallet')
  await sender.getByLabel('Recovery phrase').fill(readFileSync(seedFile ?? '', 'utf8').trim())
  await sender
    .getByLabel('Starting block (optional)')
    .fill(process.env['LIVE_TESTNET_BIRTHDAY'] ?? '')
  await sender.getByRole('button', { name: 'Restore this wallet' }).click()
  await expect(sender.getByText(/Up to date/)).toBeVisible({ timeout: BLOCKS })
  await expect(sender.getByTestId('spendable')).not.toHaveText(/^0 TAZ$/, { timeout: 60_000 })

  // The recipient publishes a card.
  await nav(recipient, 'Unsigned')
  await recipient.getByLabel('Display name').fill('Live Line')
  await recipient.getByLabel(/Short bio/).fill('Testnet check.')
  await recipient.getByLabel(/Minimum payment/).fill('0.001')
  await recipient.getByRole('button', { name: 'Create contact card' }).click()
  await expect(recipient.getByRole('heading', { name: 'Your card' })).toBeVisible()
  const link = new URL(await recipient.getByLabel('Card link').inputValue())

  // The sender opens it (inside the app, so nothing is lost), pays, writes and asks for a reply.
  await sender.evaluate((path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, link.pathname + link.hash)
  await expect(sender.getByRole('heading', { level: 1, name: 'Live Line' })).toBeVisible()
  const message = `Real testnet message ${String(Date.now())}`
  await sender.getByLabel('Your message').fill(message)
  await sender.getByLabel('Payment (ZEC)').fill('0.001')
  await sender.getByRole('checkbox', { name: /Allow a reply/ }).check()
  await sender.getByRole('button', { name: 'Send message' }).click()
  await sender.getByRole('dialog').getByRole('button', { name: 'Pay and send' }).click()
  await expect(sender.getByRole('heading', { name: 'Message sent' })).toBeVisible({
    timeout: 5 * 60_000,
  })

  // The recipient reads it once it is mined.
  await expect(async () => {
    await recipient.getByRole('button', { name: 'Check for messages' }).click()
    await expect(recipient.getByText(message)).toBeVisible({ timeout: 20_000 })
  }).toPass({ timeout: BLOCKS, intervals: [15_000] })
  await expect(recipient.getByText(/· paid 0\.001 ZEC/)).toBeVisible()

  // The recipient replies, paying the fee from what arrived, once it is spendable.
  const reply = `Reply ${String(Date.now())}`
  await expect(async () => {
    await recipient.getByRole('button', { name: 'Reply' }).first().click()
    await recipient.getByLabel(/Reply to/).fill(reply)
    await recipient.getByRole('button', { name: 'Send reply' }).click()
    await expect(recipient.getByText('You replied.')).toBeVisible({ timeout: 60_000 })
  }).toPass({ timeout: BLOCKS, intervals: [30_000] })

  // The sender finds the reply.
  await expect(async () => {
    await sender.getByRole('button', { name: 'Check for replies' }).click()
    await expect(sender.getByText(reply)).toBeVisible({ timeout: 20_000 })
  }).toPass({ timeout: BLOCKS, intervals: [15_000] })
})
