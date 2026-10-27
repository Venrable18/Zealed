import { expect, test } from '@playwright/test'
import {
  BLOCKS,
  FUNDED,
  createWallet,
  nav,
  newPage,
  ownAddress,
  restoreFundedWallet,
  setUp,
} from './live/support.ts'

/**
 * Legacy (open on a date), end to end on the real Zcash testnet (NU7) and the real drand network:
 * a funded sender seals a letter with 0.001 TAZ for a recipient with a brand-new wallet; the letter
 * and the gift wallet's funding go on chain; when the time comes the recipient opens the letter
 * and moves the gift into their wallet. Spends 0.001 TAZ plus fees.
 */
test.skip(!FUNDED, 'set LIVE_TESTNET_SEED_FILE to a funded testnet seed')
test.setTimeout(25 * 60_000)

const LETTER = `Real testnet letter ${String(Date.now())}. The key is under the blue folder.`

test('Legacy on the NU7 testnet: seal a letter with a gift, open it on time, move the gift', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const recipient = await newPage(browser, baseURL)
  const sender = await newPage(browser, baseURL)

  await setUp(recipient, { demo: true })
  await createWallet(recipient)
  const address = await ownAddress(recipient)

  await setUp(sender, { demo: true })
  await restoreFundedWallet(sender)

  await nav(sender, 'Legacy')
  await sender.getByLabel(/Recipient/).fill(address)
  await sender.getByLabel('Your letter').fill(LETTER)
  await sender.getByRole('checkbox', { name: 'Include ZEC with the letter' }).check()
  await sender.getByLabel('Gift amount (ZEC)').fill('0.001')
  await expect(sender.getByText(/Network fee:/)).toBeVisible()
  await sender.getByRole('button', { name: 'Seal and send' }).click()
  await sender
    .getByRole('dialog', { name: /^Seal it until/ })
    .getByRole('button', { name: 'Seal and send' })
    .click()
  // Funding the gift wallet and sending the letter are two transactions; the second waits for change.
  await expect(sender.getByText('Your letter was sealed and sent.')).toBeVisible({
    timeout: BLOCKS,
  })

  // The recipient finds the sealed letter once it is mined, and it is already past its time.
  await nav(recipient, 'Legacy')
  await expect(async () => {
    await recipient.getByRole('button', { name: 'Check for sealed letters' }).click()
    await expect(recipient.getByText('It is time. You can open it now.')).toBeVisible({
      timeout: 20_000,
    })
  }).toPass({ timeout: BLOCKS, intervals: [15_000] })
  await expect(async () => {
    await recipient.getByRole('button', { name: 'Open letter' }).click()
    await expect(recipient.getByText(LETTER)).toBeVisible({ timeout: 10_000 })
  }).toPass({ timeout: 2 * 60_000, intervals: [3000] })

  // The gift wallet is found from the block the letter says it was made at, then swept.
  await expect(async () => {
    await recipient.getByRole('button', { name: 'Move the gift into my wallet' }).click()
    await expect(recipient.getByText(/Moved 0\.000\d+ ZEC into your wallet/)).toBeVisible({
      timeout: 2 * 60_000,
    })
  }).toPass({ timeout: BLOCKS, intervals: [20_000] })
})
