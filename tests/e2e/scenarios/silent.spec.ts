import { randomBytes } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { SimChain } from '../../../src/test/simChain.ts'
import {
  buildHarness,
  cleanHarness,
  forgeMemos,
  guardedBundleIds,
  newActor,
  type Actor,
  type Harness,
} from '../sim/harness.ts'
import { assertClean, ZEC } from './support.ts'

test.describe.configure({ mode: 'serial' })

let harness: Harness
test.beforeAll(async () => {
  harness = await buildHarness()
})
test.afterAll(() => {
  cleanHarness(harness)
})

const LETTER = 'To my family: the documents are in the blue folder, and the key is under the clock.'

interface Cast {
  chain: SimChain
  owner: Actor
  g1: Actor
  g2: Actor
  g3: Actor
  heir: Actor
}

async function cast(browser: Browser, baseURL: string): Promise<Cast> {
  const chain = new SimChain()
  const owner = await newActor(browser, harness, chain, baseURL, 'owner', { fundsZat: 10n * ZEC })
  const g1 = await newActor(browser, harness, chain, baseURL, 'guardianone')
  const g2 = await newActor(browser, harness, chain, baseURL, 'guardiantwo')
  const g3 = await newActor(browser, harness, chain, baseURL, 'guardianthree')
  const heir = await newActor(browser, harness, chain, baseURL, 'heir', { fundsZat: 0n })
  return { chain, owner, g1, g2, g3, heir }
}

async function open(page: Page) {
  await page.goto('/legacy/silent?demo=1')
  await expect(page.getByRole('heading', { level: 1, name: 'If I go silent' })).toBeVisible()
}

const checkMessages = (page: Page) =>
  page.getByRole('button', { name: 'Check for messages' }).click()

/** The owner seals a letter with a 0.25 ZEC gift: check in every `periodSeconds`, then wait `graceSeconds`. */
async function setup(c: Cast, periodSeconds: string, graceSeconds: string) {
  const p = c.owner.page
  await open(p)
  await p.getByLabel(/Heir’s Zealed address/).fill(c.heir.address)
  await p.getByLabel('Guardian 1 address').fill(c.g1.address)
  await p.getByLabel('Guardian 2 address').fill(c.g2.address)
  await p.getByLabel('Guardian 3 address').fill(c.g3.address)
  await p.getByLabel('Check in every', { exact: true }).fill(periodSeconds)
  await p.getByLabel('Check in every unit').selectOption('seconds')
  await p.getByLabel('Then wait', { exact: true }).fill(graceSeconds)
  await p.getByLabel('Then wait unit').selectOption('seconds')
  await p.getByLabel('Your letter').fill(LETTER)
  await p.getByRole('checkbox', { name: 'Include ZEC with the letter' }).check()
  await p.getByLabel('Gift amount (ZEC)').fill('0.25')
  await p.getByRole('button', { name: 'Seal and send' }).click()
  await p.getByRole('dialog').getByRole('button', { name: 'Seal and send' }).click()
  await expect(p.getByText('Your letter is sealed. Remember to check in.')).toBeVisible()
  await expect(p.getByText(/Letter for /)).toBeVisible()
}

test('Legacy Mode B: the owner checks in once and stops; two of three guardians release; the heir opens the letter and claims the funds', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const c = await cast(browser, baseURL)
  const { chain, owner, g1, g2, g3, heir } = c

  await setup(c, '30', '10')
  expect(chain.receivedAt(heir.address)).toBe(0n)

  // Outsiders send junk and malformed memos to everyone; the app must ignore all of it.
  for (const actor of [owner, g1, g2, g3, heir]) {
    chain.inject(actor.address, [
      randomBytes(512),
      new Uint8Array(512).fill(0xff),
      new TextEncoder().encode('hello there'),
      randomBytes(30),
    ])
  }

  // Guardians and the heir find out about the letter. Nobody can open it yet.
  await Promise.all([g1, g2, g3, heir].map((a) => open(a.page)))
  await Promise.all([g1, g2, g3, heir].map((a) => checkMessages(a.page)))
  for (const guardian of [g1, g2, g3]) {
    await expect(guardian.page.getByText(/Guarding a letter from/)).toBeVisible()
    await expect(guardian.page.getByText('OK', { exact: true })).toBeVisible()
  }
  await expect(heir.page.getByText(/Waiting for guardians \(0 of 2 shares\)/)).toBeVisible()
  await expect(heir.page.getByRole('button', { name: 'Open letter' })).toBeDisabled()

  // The owner checks in once. The third guardian then goes offline for good.
  await owner.page.waitForTimeout(5000)
  await owner.page.getByRole('button', { name: 'Check in', exact: true }).click()
  const checkedInAt = Date.now()
  await expect(owner.page.getByText('Checked in.')).toBeVisible()
  await g3.close()
  await Promise.all([g1, g2].map((a) => checkMessages(a.page)))

  // Shortly before the deadline someone forges a check-in for guardian one. It must change nothing.
  const [bundleHex = ''] = await guardedBundleIds(g1.page)
  expect(bundleHex).toMatch(/^[0-9a-f]{32}$/)
  await owner.page.waitForTimeout(18_000)
  chain.inject(g1.address, await forgeMemos(g1.page, 'forgedCheckIn', bundleHex, 50))
  await checkMessages(g1.page)

  // The deadline passes: both online guardians see the owner overdue, then release after the grace period.
  // (A forged check-in that was accepted would have pushed the deadline out by about 18 seconds.)
  await expect(g1.page.getByText('Overdue', { exact: true })).toBeVisible({ timeout: 40_000 })
  const overdueAfter = Date.now() - checkedInAt
  expect(overdueAfter).toBeGreaterThan(29_000)
  expect(overdueAfter).toBeLessThan(46_000)
  await expect(g2.page.getByText('Overdue', { exact: true })).toBeVisible({ timeout: 40_000 })
  await expect(g1.page.getByText('Released', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(g2.page.getByText('Released', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(g1.page.getByRole('button', { name: 'Release to the heir' })).toHaveCount(0)

  // The heir sees both shares, opens the letter and claims the funds.
  await checkMessages(heir.page)
  await expect(heir.page.getByText(/Waiting for guardians \(2 of 2 shares\)/)).toBeVisible()
  await heir.page.getByRole('button', { name: 'Open letter' }).click()
  await expect(heir.page.getByText(LETTER)).toBeVisible()
  await heir.page.getByRole('button', { name: 'Move the gift into my wallet' }).click()
  await expect(heir.page.getByText(/Moved 0\.2499 ZEC into your wallet/)).toBeVisible()
  expect(chain.balanceZat('heir')).toBe(25_000_000n - 10_000n)

  await assertClean([owner, g1, g2, heir], baseURL)
  await Promise.all([owner.close(), g1.close(), g2.close(), heir.close()])
})

test('Legacy Mode B: a forged check-in and a forged revoke change nothing; the real owner revokes and no one can open the letter', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const c = await cast(browser, baseURL)
  const { chain, owner, g1, g2, g3, heir } = c

  await setup(c, '30', '10')
  await Promise.all([g1, g2, g3, heir].map((a) => open(a.page)))
  await Promise.all([g1, g2, g3, heir].map((a) => checkMessages(a.page)))
  await expect(g1.page.getByText('OK', { exact: true })).toBeVisible()
  const [bundleHex = ''] = await guardedBundleIds(g1.page)
  expect(bundleHex).toMatch(/^[0-9a-f]{32}$/)

  // A forged check-in and a forged revoke (made with someone else's key) reach guardian one.
  chain.inject(g1.address, await forgeMemos(g1.page, 'forgedCheckIn', bundleHex, 99))
  chain.inject(g1.address, await forgeMemos(g1.page, 'forgedRevoke', bundleHex))
  await checkMessages(g1.page)
  await expect(g1.page.getByText('OK', { exact: true })).toBeVisible()
  await expect(g1.page.getByText('Revoked', { exact: true })).toHaveCount(0)

  // The real owner revokes, so every guardian erases its share.
  await owner.page.getByRole('button', { name: 'Revoke letter' }).click()
  await owner.page.getByRole('dialog').getByRole('button', { name: 'Revoke', exact: true }).click()
  await expect(owner.page.getByText(/Revoked\. Guardians were told/)).toBeVisible()
  await Promise.all([g1, g2, g3].map((a) => checkMessages(a.page)))
  for (const guardian of [g1, g2, g3])
    await expect(guardian.page.getByText('Revoked', { exact: true })).toBeVisible()

  // Well past the deadline and the grace period, nothing was released and the heir cannot open the letter.
  await owner.page.waitForTimeout(45_000)
  await checkMessages(heir.page)
  await expect(heir.page.getByText(/Waiting for guardians \(0 of 2 shares\)/)).toBeVisible()
  await expect(heir.page.getByRole('button', { name: 'Open letter' })).toBeDisabled()
  expect(chain.balanceZat('heir')).toBe(0n)
  await expect(g1.page.getByText('Released', { exact: true })).toHaveCount(0)

  await assertClean([owner, g1, g2, g3, heir], baseURL)
  await Promise.all([owner, g1, g2, g3, heir].map((a) => a.close()))
})
