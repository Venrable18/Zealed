import { expect, test, type Page } from '@playwright/test'
import { SimChain } from '../../../src/test/simChain.ts'
import { buildHarness, cleanHarness, newActor, type Harness } from '../sim/harness.ts'
import { assertClean, ZEC } from './support.ts'

test.describe.configure({ mode: 'serial' })

let harness: Harness
test.beforeAll(async () => {
  harness = await buildHarness()
})
test.afterAll(() => {
  cleanHarness(harness)
})

/** A host with a pot, and its guest link. */
async function pot(host: Page) {
  await host.goto('/blind-pot?demo=1')
  await host.getByLabel('Pot name').fill('Ada and Tunde')
  await host.getByLabel('Event date').fill('2099-01-01')
  await host.getByLabel('Last day for gifts').fill('2099-02-01')
  await host.getByRole('button', { name: 'Create pot' }).click()
  await expect(host.getByRole('heading', { level: 1, name: /Ada and Tunde/ })).toBeVisible()
  return host.getByRole('textbox', { name: 'Pot link' }).inputValue()
}

async function startGift(page: Page, link: string, amount: string) {
  await page.goto('/?demo=1')
  await page.goto(link)
  await page.getByLabel('Gift amount (ZEC)').fill(amount)
  await page.getByRole('button', { name: 'Send gift' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click()
}

test('errors: not enough money is refused up front, and a gift that runs out partway can be continued after adding funds', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const chain = new SimChain()
  const host = await newActor(browser, harness, chain, baseURL, 'host')
  const poor = await newActor(browser, harness, chain, baseURL, 'poor', { fundsZat: ZEC / 100n })
  // 0.3 ZEC is split 0.2 + 0.1; this guest can afford the first piece and its fee but not the second.
  const short = await newActor(browser, harness, chain, baseURL, 'short', { fundsZat: 30_010_000n })
  const link = await pot(host.page)

  // Far too little: refused before anything is sent.
  await startGift(poor.page, link, '0.3')
  await expect(poor.page.getByRole('alert')).toContainText('You have 0.01 ZEC to spend')
  expect(chain.notes.filter((n) => n.zat > 0n)).toHaveLength(0)

  // Enough to start, not to finish: the first piece goes, then it pauses and says so.
  await startGift(short.page, link, '0.3')
  await expect(short.page.getByRole('alert')).toContainText('ran out of funds', { timeout: 60_000 })
  expect(chain.notes.filter((n) => n.zat > 0n)).toHaveLength(1)
  await expect(short.page.getByText(/1 of 2 pieces sent/)).toBeVisible()

  // The guest adds funds and continues; the rest of the gift goes out and nothing is lost or repeated.
  chain.topUp('short', ZEC)
  await short.page.getByRole('button', { name: 'Continue' }).click()
  await expect(short.page.getByRole('heading', { name: 'Thank you' })).toBeVisible({
    timeout: 60_000,
  })
  const pieces = chain.notes.filter((n) => n.zat > 0n)
  expect(pieces.map((n) => n.zat).sort()).toEqual([10_000_000n, 20_000_000n])
  expect(new Set(pieces.map((n) => n.txid)).size).toBe(2)

  await assertClean([host, poor, short], baseURL)
  await Promise.all([host.close(), poor.close(), short.close()])
})

test('errors: change that is not spendable yet is waited for, not treated as a failure', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const chain = new SimChain()
  chain.changeLockMs = 12_000
  const host = await newActor(browser, harness, chain, baseURL, 'host')
  const guest = await newActor(browser, harness, chain, baseURL, 'guest', { fundsZat: 5n * ZEC })
  const link = await pot(host.page)

  const started = Date.now()
  await startGift(guest.page, link, '0.3')
  // The second piece is refused as "not spendable yet". The app keeps waiting and retries; it never shows an error.
  await expect(guest.page.getByRole('heading', { name: 'Thank you' })).toBeVisible({
    timeout: 90_000,
  })
  expect(Date.now() - started).toBeGreaterThan(25_000)
  await expect(guest.page.getByRole('alert')).toHaveCount(0)
  const pieces = chain.notes.filter((n) => n.zat > 0n)
  expect(pieces.map((n) => n.zat).sort()).toEqual([10_000_000n, 20_000_000n])

  await assertClean([host, guest], baseURL)
  await Promise.all([host.close(), guest.close()])
})

test('errors: the app stays responsive: the main thread is never blocked for long, even while sealing', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const chain = new SimChain()
  const owner = await newActor(browser, harness, chain, baseURL, 'owner', { fundsZat: 10n * ZEC })
  const heir = await newActor(browser, harness, chain, baseURL, 'heir', { fundsZat: 0n })
  const guardians = await Promise.all(
    ['one', 'two', 'three'].map((n) => newActor(browser, harness, chain, baseURL, `guardian${n}`)),
  )
  const p = owner.page
  await p.goto('/legacy/silent?demo=1')
  await p.getByLabel(/Heir’s Zealed address/).fill(heir.address)
  for (const [i, g] of guardians.entries())
    await p.getByLabel(`Guardian ${String(i + 1)} address`).fill(g.address)
  await p.getByLabel('Your letter').fill('x'.repeat(2000))
  await p.getByRole('button', { name: 'Seal and send' }).click()
  await p.getByRole('dialog').getByRole('button', { name: 'Seal and send' }).click()
  await expect(p.getByText('Your letter is sealed. Remember to check in.')).toBeVisible()

  const longest = await owner.longestTask()
  test.info().annotations.push({
    type: 'longest main-thread block (ms)',
    description: String(Math.round(longest)),
  })
  // Sealing a 2 KB letter for 3 guardians (key split, signing, encryption) must not freeze the page.
  expect(longest).toBeLessThan(500)

  await assertClean([owner], baseURL)
  await Promise.all([owner, heir, ...guardians].map((a) => a.close()))
})
