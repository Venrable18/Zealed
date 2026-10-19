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

const STANDARD_PIECES = new Set([
  100_000n,
  200_000n,
  500_000n,
  1_000_000n,
  2_000_000n,
  5_000_000n,
  10_000_000n,
  20_000_000n,
  50_000_000n,
  100_000_000n,
  200_000_000n,
  500_000_000n,
  1_000_000_000n,
])

async function give(page: Page, link: string, amount: string, wish?: string) {
  await page.goto('/?demo=1')
  await page.goto(link)
  await page.getByLabel('Gift amount (ZEC)').fill(amount)
  if (wish !== undefined) await page.getByLabel(/A wish for the host/).fill(wish)
  await page.getByRole('button', { name: 'Send gift' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click()
}

test('Blind Pot: a host and three guests; the host sees only a batched total and wishes', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const chain = new SimChain()
  const host = await newActor(browser, harness, chain, baseURL, 'host')
  const funds = { fundsZat: 10n * ZEC }
  const g1 = await newActor(browser, harness, chain, baseURL, 'guest1', funds)
  const g2 = await newActor(browser, harness, chain, baseURL, 'guest2', funds)
  const g3 = await newActor(browser, harness, chain, baseURL, 'guest3', funds)
  const guests = [g1, g2, g3]
  const hp = host.page

  // The host creates a pot, in demo mode so batches are 60 seconds.
  await hp.goto('/blind-pot?demo=1')
  await hp.getByLabel('Pot name').fill('Ada and Tunde')
  await hp.getByLabel(/Cover emoji/).fill('🎁')
  await hp.getByLabel('Event date').fill('2099-01-01')
  await hp.getByLabel('Last day for gifts').fill('2099-02-01')
  await hp.getByRole('button', { name: 'Create pot' }).click()
  await expect(hp.getByRole('heading', { level: 1, name: /Ada and Tunde/ })).toBeVisible()
  const link = await hp.getByRole('textbox', { name: 'Pot link' }).inputValue()
  const createdAt = Date.now()
  expect(new URL(link).pathname).toBe('/blind-pot/give')
  expect(new URL(link).search).toBe('')
  expect(new URL(link).hash.startsWith('#pot=')).toBe(true)
  await expect(hp.getByText('Weaker privacy.')).toBeVisible()
  await expect(hp.getByText('No wishes yet')).toBeVisible()

  // Three guests give different amounts at once; one adds a wish.
  await Promise.all([
    give(g1.page, link, '0.5'),
    give(g2.page, link, '0.05', 'Many happy years'),
    give(g3.page, link, '0.3'),
  ])
  for (const guest of guests) {
    await expect(guest.page.getByRole('heading', { name: 'Thank you' })).toBeVisible({
      timeout: 120_000,
    })
    await expect(guest.page.getByText(/This receipt is only for you/)).toBeVisible()
  }
  await expect(g2.page.getByText(/You sent 0\.05 ZEC in 6 pieces/)).toBeVisible()
  await expect(g2.page.getByText(/Many happy years/)).toBeVisible()
  await expect(g1.page.getByText(/You sent 0\.5 ZEC in 1 piece/)).toBeVisible()
  await expect(g3.page.getByText(/You sent 0\.3 ZEC in 2 pieces/)).toBeVisible()

  // On the chain: each piece is its own transaction, a standard size, spread out in time.
  const potAddress = chain.notes[0]?.to ?? ''
  const pieces = chain.notes.filter((note) => note.to === potAddress && note.zat > 0n)
  expect(pieces).toHaveLength(9)
  expect(new Set(pieces.map((note) => note.txid)).size).toBe(9)
  expect(pieces.every((note) => STANDARD_PIECES.has(note.zat))).toBe(true)
  expect(pieces.reduce((sum, note) => sum + note.zat, 0n)).toBe(85_000_000n)
  const withMemo = pieces.filter((note) => note.memos.length > 0)
  expect(withMemo).toHaveLength(1)
  expect(withMemo[0]?.zat).toBe(100_000n)
  const times = pieces.map((note) => note.atMs).sort((a, b) => a - b)
  expect((times.at(-1) ?? 0) - (times[0] ?? 0)).toBeGreaterThan(4000)
  // Each guest paid the gift plus a fee per piece.
  expect(chain.balanceZat('guest1')).toBe(10n * ZEC - ZEC / 2n - 10_000n)
  expect(chain.balanceZat('guest3')).toBe(10n * ZEC - (3n * ZEC) / 10n - 2n * 10_000n)

  // The host sees only a batched total once the next batch passes, never any single gift.
  const total = hp
    .locator('main')
    .getByText('Total so far')
    .locator('xpath=following-sibling::p[1]')
  await expect(total).toContainText('0.85', {
    timeout: Math.max(150_000 - (Date.now() - createdAt), 30_000),
  })
  await expect(hp.getByText('Many happy years')).toBeVisible()
  await expect(hp.getByText(/Privacy strength/)).toBeVisible()
  await expect(hp.getByText('Medium', { exact: false }).first()).toBeVisible()
  const hostText = (await hp.locator('main').innerText()).replace(/0\.85/g, '')
  for (const single of ['0.5', '0.3', '0.05', '0.2', '0.1', '0.02', '0.005', '0.002', '0.001']) {
    expect(hostText, `host screen must not show ${single}`).not.toMatch(
      new RegExp(`(^|[^\\d.])${single.replace('.', '\\.')}(?![\\d])`),
    )
  }

  // The host closes the pot and withdraws.
  await hp.getByRole('button', { name: 'Close pot and withdraw' }).click()
  await hp.getByRole('dialog').getByRole('button', { name: 'Close and withdraw' }).click()
  await expect(hp.getByText(/This pot is closed/)).toBeVisible()

  await assertClean([host, ...guests], baseURL)
  await Promise.all([host.close(), ...guests.map((guest) => guest.close())])
})
