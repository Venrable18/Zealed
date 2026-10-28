import { appendFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  BLOCKS,
  FUNDED,
  createWallet,
  nav,
  newPage,
  openInApp,
  ownAddress,
  restoreFundedWallet,
  restoreWallet,
  setUp,
} from './live/support.ts'

/**
 * A Blind Pot with a co-host, end to end on the real Zcash testnet (NU7). A funded wallet pays two
 * brand-new wallets a little test money for their messages. The host invites the co-host and asks
 * for 2 of 2 approvals; both make the pot's key together over memos (FROST), so neither holds it.
 * The funded wallet gives a gift. The host asks to withdraw, the co-host reads the request from the
 * transaction and approves, and the money moves only once both have signed. Spends about 0.008 TAZ
 * plus fees. The new wallets' recovery phrases are appended to `zealed-live-seeds.txt` in the system
 * temp folder, so their test money can be recovered if the test stops halfway. To reuse two such
 * wallets instead (no new funding), set `LIVE_SHARED_SEEDS` to a file with the host's phrase on the
 * first line and the co-host's on the second, and `LIVE_SHARED_BIRTHDAY` to a block before either
 * was funded.
 */
test.skip(!FUNDED, 'set LIVE_TESTNET_SEED_FILE to a funded testnet seed')
test.setTimeout(90 * 60_000)

const RUNTIME = '/src/wallet/runtime.ts'

interface Runtime {
  useWalletRuntime: {
    getState: () => {
      wallet: {
        sendPayment: (args: {
          to: string
          zat: bigint
          memos: Uint8Array[]
        }) => Promise<{ txid: string }>
      } | null
    }
  }
}

async function pay(from: Page, to: string, zat: number) {
  const txid = await from.evaluate(
    async ({ address, amount, path }) => {
      const runtime = (await import(path)) as Runtime
      const wallet = runtime.useWalletRuntime.getState().wallet
      if (wallet === null) throw new Error('no wallet')
      return (await wallet.sendPayment({ to: address, zat: BigInt(amount), memos: [] })).txid
    },
    { address: to, amount: zat, path: RUNTIME },
  )
  expect(txid).toMatch(/^[0-9a-f]{64}$/)
}

/** Presses a key in each page now and then, so the app's auto-lock never closes a wallet mid-test. */
function keepAwake(pages: Page[]): () => void {
  const timer = setInterval(() => {
    for (const page of pages) void page.keyboard.press('Shift').catch(() => undefined)
  }, 2 * 60_000)
  return () => {
    clearInterval(timer)
  }
}

async function waitForMoney(page: Page) {
  await nav(page, 'Wallet')
  await expect(page.getByTestId('spendable')).not.toHaveText(/^0 TAZ$/, { timeout: BLOCKS })
}

test('a shared Blind Pot on the NU7 testnet: two co-hosts make the key and both sign the withdrawal', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const funder = await newPage(browser, baseURL)
  const host = await newPage(browser, baseURL)
  const bob = await newPage(browser, baseURL)
  const stopKeepAwake = keepAwake([funder, host, bob])
  // A click that waits for a button that never comes should fail fast, with the page's text.
  for (const page of [host, bob]) page.setDefaultTimeout(60_000)

  await setUp(funder, { demo: true })
  await restoreFundedWallet(funder)
  const people = [host, bob]
  const reuse = process.env['LIVE_SHARED_SEEDS']
  if (reuse === undefined) {
    for (const page of people) {
      await setUp(page, { demo: true })
      const phrase = await createWallet(page)
      appendFileSync(
        join(tmpdir(), 'zealed-live-seeds.txt'),
        `${new Date().toISOString()} ${phrase}\n`,
      )
    }
    await pay(funder, await ownAddress(host), 400_000)
    await pay(funder, await ownAddress(bob), 300_000)
    for (const page of people) await waitForMoney(page)
  } else {
    const phrases = readFileSync(reuse, 'utf8').trim().split('\n')
    for (const [i, page] of people.entries()) {
      await setUp(page, { demo: true })
      await restoreWallet(page, phrases[i] ?? '', process.env['LIVE_SHARED_BIRTHDAY'] ?? '')
    }
  }
  const bobAddress = await ownAddress(bob)
  // Earlier runs left their own invitations on chain; this run's pot has its own name.
  const potName = `Shared Pot ${String(Date.now() % 100_000)}`

  // The host invites the co-host; both must approve.
  await nav(host, 'Blind Pot')
  await host.getByLabel('Pot name').fill(potName)
  await host.getByLabel('Event date').fill('2099-01-01')
  await host.getByLabel('Last day for gifts').fill('2099-02-01')
  await host.getByLabel(/Require co-hosts/).check()
  await host.getByLabel('Co-host 1 address').fill(bobAddress)
  await host.getByLabel('Approvals needed to move the money').selectOption('2')
  await host.getByRole('button', { name: 'Invite co-hosts' }).click()
  await expect(host.getByText(/Invitations sent/)).toBeVisible({ timeout: 2 * 60_000 })

  // The co-host sees the invitation once it is mined, and accepts.
  await nav(bob, 'Blind Pot')
  const invitation = bob.getByRole('listitem').filter({ hasText: `co-host “${potName}”` })
  await expect(invitation).toBeVisible({ timeout: BLOCKS })
  await invitation.getByRole('button', { name: 'Accept' }).click()
  await expect(bob.getByText(/Accepted\./)).toBeVisible({ timeout: 2 * 60_000 })

  // Key generation runs over a few rounds of memos; then the pot appears under Your pots.
  await nav(host, 'Blind Pot')
  try {
    await expect(host.getByRole('link', { name: potName })).toBeVisible({ timeout: 15 * 60_000 })
  } catch (error) {
    for (const [who, page] of [
      ['HOST', host],
      ['CO-HOST', bob],
    ] as const) {
      await nav(page, 'Blind Pot')
      console.log(`${who} PAGE:`, (await page.locator('main').innerText()).slice(0, 2500))
    }
    throw error
  }
  await host.getByRole('link', { name: potName }).click()
  const link = await host.getByRole('textbox', { name: 'Pot link' }).inputValue()

  // A guest gives to the pot like any other.
  await openInApp(funder, link)
  await funder.getByLabel('Gift amount (ZEC)').fill('0.001')
  await funder.getByRole('button', { name: 'Send gift' }).click()
  await funder.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click()
  await expect(funder.getByRole('heading', { name: 'Thank you' })).toBeVisible({
    timeout: 3 * BLOCKS,
  })

  // The host asks to withdraw once the gift is spendable in the pot.
  await expect(async () => {
    try {
      await nav(host, 'Blind Pot')
      await host.getByRole('link', { name: potName }).first().click()
      await host.getByRole('button', { name: 'Ask co-hosts to approve a withdrawal' }).click()
      await host.getByRole('dialog').getByRole('button', { name: 'Send the request' }).click()
      await expect(host.getByText(/approvals so far/)).toBeVisible({ timeout: 2 * 60_000 })
    } catch (error) {
      console.log('HOST PAGE:', (await host.locator('body').innerText()).slice(0, 1500))
      throw error
    }
  }).toPass({ timeout: 2 * BLOCKS, intervals: [30_000] })

  // The co-host reads the request from the transaction itself and approves.
  await nav(bob, 'Blind Pot')
  const request = bob
    .getByRole('listitem')
    .filter({ hasText: `asks to move money out of “${potName}”` })
  await expect(request).toBeVisible({ timeout: BLOCKS })
  await expect(request.getByText(/the host’s wallet/)).toBeVisible()
  await request.getByRole('button', { name: 'Approve' }).click()

  // With two signatures the host's wallet builds, proves and sends the withdrawal.
  await nav(host, 'Blind Pot')
  await host.getByRole('link', { name: potName }).first().click()
  // The request is done and the pot stays open for gifts until its deadline.
  await expect(host.getByText(/Waiting for your co-hosts|Collecting their signatures/)).toBeHidden({
    timeout: 4 * BLOCKS,
  })
  await expect(host.getByText(/This pot is closed/)).toBeHidden()
  stopKeepAwake()
})
