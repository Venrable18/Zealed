import { expect, test } from '@playwright/test'
import {
  BLOCKS,
  FUNDED,
  createWallet,
  nav,
  newPage,
  openInApp,
  restoreFundedWallet,
  setUp,
} from './live/support.ts'

/**
 * Blind Pot, end to end on the real Zcash testnet (NU7): a host with a brand-new wallet creates a
 * pot (a separate account); a funded guest gives 0.003 TAZ with a wish, as standard-size pieces in
 * separate transactions; the host sees only the batched total and the wish, then closes the pot
 * and withdraws into their main account. Spends 0.003 TAZ plus fees.
 */
test.skip(!FUNDED, 'set LIVE_TESTNET_SEED_FILE to a funded testnet seed')
test.setTimeout(30 * 60_000)

test('Blind Pot on the NU7 testnet: a guest gives in pieces with a wish; the host sees the total and withdraws', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const host = await newPage(browser, baseURL)
  const guest = await newPage(browser, baseURL)

  await setUp(host, { demo: true })
  await createWallet(host)
  await setUp(guest, { demo: true })
  await restoreFundedWallet(guest)

  await nav(host, 'Blind Pot')
  await host.getByLabel('Pot name').fill('Live Pot')
  await host.getByLabel(/Cover emoji/).fill('🎁')
  await host.getByLabel('Event date').fill('2099-01-01')
  await host.getByLabel('Last day for gifts').fill('2099-02-01')
  await host.getByRole('button', { name: 'Create pot' }).click()
  await expect(host.getByRole('heading', { level: 1, name: /Live Pot/ })).toBeVisible({
    timeout: 60_000,
  })
  const link = await host.getByRole('textbox', { name: 'Pot link' }).inputValue()

  const wish = `Many happy years ${String(Date.now())}`
  await openInApp(guest, link)
  await guest.getByLabel('Gift amount (ZEC)').fill('0.003')
  await guest.getByLabel(/A wish for the host/).fill(wish)
  await guest.getByRole('button', { name: 'Send gift' }).click()
  await guest.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click()
  // Each piece is its own transaction, and each waits for the change from the last to confirm.
  await expect(guest.getByRole('heading', { name: 'Thank you' })).toBeVisible({
    timeout: 3 * BLOCKS,
  })

  // The host sees the total and the wish once the pieces are mined and the batch has passed.
  const total = host
    .locator('main')
    .getByText('Total so far')
    .locator('xpath=following-sibling::p[1]')
  await expect(async () => {
    await nav(host, 'Blind Pot')
    await host
      .getByRole('link', { name: /Live Pot/ })
      .first()
      .click()
    await expect(total).toContainText('0.003', { timeout: 20_000 })
  }).toPass({ timeout: BLOCKS, intervals: [20_000] })
  await expect(host.getByText(wish)).toBeVisible()

  // The host closes the pot and moves everything into their main account.
  await expect(async () => {
    await host.getByRole('button', { name: 'Close pot and withdraw' }).click()
    await host.getByRole('dialog').getByRole('button', { name: 'Close and withdraw' }).click()
    await expect(host.getByText(/This pot is closed/)).toBeVisible({ timeout: 2 * 60_000 })
  }).toPass({ timeout: BLOCKS, intervals: [30_000] })
})
