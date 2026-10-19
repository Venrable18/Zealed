import { expect, test, type Browser, type BrowserContext } from '@playwright/test'
import { DRAND } from '../../../src/config/network.ts'
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

const LETTER = 'See you on the other side. Everything you need is in the blue folder.'
const DRAND_ORIGIN = DRAND.baseUrl

/** drand quicknet's public chain description (the same data tlock-js ships with). Sealing needs only this. */
const CHAIN_INFO = {
  public_key:
    '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
  period: 3,
  genesis_time: 1692803367,
  hash: DRAND.chainHash,
  groupHash: 'f477d5c89f21a17c863a7f937c6a6d15859414d2be09cd448d4279af331c5d3e',
  schemeID: 'bls-unchained-g1-rfc9380',
  metadata: { beaconID: 'quicknet' },
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

/** drand that answers the chain description but never a beacon: sealing works, opening cannot. */
async function drandWithoutBeacons(context: BrowserContext) {
  await context.route(`${DRAND_ORIGIN}/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().endsWith('/info'))
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify(CHAIN_INFO),
      })
    return route.abort('connectionrefused')
  })
}

async function seal(
  browser: Browser,
  baseURL: string,
  sender: { setup?: (c: BrowserContext) => Promise<void> },
  recipient: { setup?: (c: BrowserContext) => Promise<void> },
) {
  const chain = new SimChain()
  const s = await newActor(browser, harness, chain, baseURL, 'sender', {
    fundsZat: 10n * ZEC,
    ...sender,
  })
  const r = await newActor(browser, harness, chain, baseURL, 'recipient', {
    fundsZat: 0n,
    ...recipient,
  })
  const sp = s.page
  await sp.goto('/legacy?demo=1')
  await expect(sp.getByRole('heading', { level: 1, name: 'Legacy' })).toBeVisible()
  await sp.getByLabel(/Recipient/).fill(r.address)
  await sp.getByLabel('Your letter').fill(LETTER)
  await sp.getByRole('checkbox', { name: 'Include ZEC with the letter' }).check()
  await sp.getByLabel('Gift amount (ZEC)').fill('0.25')
  await expect(sp.getByText(/Network fee:/)).toBeVisible()
  await sp.getByRole('button', { name: 'Seal and send' }).click()
  const dialog = sp.getByRole('dialog', { name: 'Seal this letter?' })
  await expect(dialog).toContainText('0.25 ZEC')
  await dialog.getByRole('button', { name: 'Seal and send' }).click()
  await expect(sp.getByText('Your letter was sealed and sent.')).toBeVisible({ timeout: 20_000 })
  const sealedAt = Date.now()
  // The sender sees it was sent, and is told they cannot know if it was opened.
  await expect(sp.locator('p', { hasText: /^Sent$/ })).toBeVisible()
  await expect(sp.getByText(/cannot tell you whether a letter has been opened/)).toBeVisible()
  // The gift was funded before the letter went out, and the letter travelled as memos.
  expect(chain.notes.map((n) => n.zat > 0n && n.memos.length === 0)[0]).toBe(true)
  expect(chain.notes.at(-1)?.memos.length).toBeGreaterThan(0)
  return { chain, s, r, sealedAt }
}

test('Legacy Mode A: a sealed letter cannot be opened early, and says so when the drand network cannot be reached', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const { chain, s, r, sealedAt } = await seal(
    browser,
    baseURL,
    { setup: drandWithoutBeacons },
    { setup: drandWithoutBeacons },
  )
  const rp = r.page

  // Timelock sealing does heavy maths in the browser (a BLS pairing); the page must stay responsive.
  const longest = await s.longestTask()
  test.info().annotations.push({
    type: 'longest main-thread block while sealing (ms)',
    description: String(Math.round(longest)),
  })
  // Measured at about 90 ms; the limit leaves room for a slow machine.
  expect(longest).toBeLessThan(500)

  await rp.goto('/legacy?demo=1')
  await rp.getByRole('button', { name: 'Check for sealed letters' }).click()
  await expect(rp.getByText(/Sealed until/)).toBeVisible()
  await expect(rp.getByText('It cannot be opened before then, by anyone.')).toBeVisible()
  await expect(rp.getByRole('button', { name: 'Open letter' })).toBeDisabled()
  expect(await rp.getByText(LETTER).count()).toBe(0)

  // When the time comes, the key cannot be fetched: the app says so and lets the person try again.
  await expect(rp.getByText('It is time. You can open it now.')).toBeVisible({ timeout: 45_000 })
  expect(Date.now() - sealedAt).toBeGreaterThan(25_000)
  await rp.getByRole('button', { name: 'Open letter' }).click()
  await expect(rp.getByRole('alert')).toContainText('could not be fetched from the drand network')
  await expect(rp.getByRole('button', { name: 'Open letter' })).toBeEnabled()
  expect(await rp.getByText(LETTER).count()).toBe(0)
  expect(chain.balanceZat('recipient')).toBe(0n)

  await assertClean([s, r], baseURL, [DRAND_ORIGIN], [/ERR_CONNECTION_REFUSED/])
  await Promise.all([s.close(), r.close()])
})

// Needs the internet: the real drand network publishes the key when the time comes. Run with LIVE_DRAND=1.
test.describe('against the real drand network', () => {
  test.skip(process.env['LIVE_DRAND'] !== '1', 'needs the internet; set LIVE_DRAND=1')

  test('Legacy Mode A: a letter and funds sealed 30 seconds ahead open on the recipient side and the funds are swept', async ({
    browser,
    baseURL,
  }) => {
    if (baseURL === undefined) throw new Error('no baseURL')
    const { chain, s, r } = await seal(browser, baseURL, {}, {})
    const rp = r.page

    await rp.goto('/legacy?demo=1')
    await rp.getByRole('button', { name: 'Check for sealed letters' }).click()
    await expect(rp.getByText('It cannot be opened before then, by anyone.')).toBeVisible()
    await expect(rp.getByRole('button', { name: 'Open letter' })).toBeDisabled()

    await expect(rp.getByText('It is time. You can open it now.')).toBeVisible({ timeout: 45_000 })
    // The key is published a moment after the time; if it is not there yet, try again.
    await expect(async () => {
      await rp.getByRole('button', { name: 'Open letter' }).click()
      await expect(rp.getByText(LETTER)).toBeVisible({ timeout: 4000 })
    }).toPass({ timeout: 30_000, intervals: [1500] })

    await rp.getByRole('button', { name: 'Move the gift into my wallet' }).click()
    await expect(rp.getByText(/Moved 0\.2499 ZEC into your wallet/)).toBeVisible()
    expect(chain.balanceZat('recipient')).toBe(25_000_000n - 10_000n)

    await assertClean([s, r], baseURL, [DRAND_ORIGIN])
    await Promise.all([s.close(), r.close()])
  })
})
