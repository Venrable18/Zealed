import { expect, test } from '@playwright/test'
import { SimChain } from '../../../src/test/simChain.ts'
import { buildHarness, cleanHarness, newActor, type Harness } from '../sim/harness.ts'
import { assertClean } from './support.ts'

test.describe.configure({ mode: 'serial' })

let harness: Harness
test.beforeAll(async () => {
  harness = await buildHarness()
})
test.afterAll(() => {
  cleanHarness(harness)
})

const PASS = 'correct horse battery'

test('A host who chose a passphrase gets the pot and a contact back after a reload', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const chain = new SimChain()
  const host = await newActor(browser, harness, chain, baseURL, 'host')
  const page = host.page
  const nav = page.getByRole('navigation', { name: 'Main' })

  await page.goto('/blind-pot?demo=1')
  await page.getByLabel('Pot name').fill('Ada and Tunde')
  await page.getByLabel('Event date').fill('2099-01-01')
  await page.getByLabel('Last day for gifts').fill('2099-02-01')
  await page.getByRole('button', { name: 'Create pot' }).click()
  const heading = page.getByRole('heading', { level: 1, name: /Ada and Tunde/ })
  await expect(heading).toBeVisible()
  const link = await page.getByRole('textbox', { name: 'Pot link' }).inputValue()

  // Choosing a passphrase from Settings, using the app's own links so nothing is lost.
  await nav.getByRole('link', { name: 'Settings' }).click()
  await page.getByLabel('New passphrase').first().fill(PASS)
  await page.getByLabel('Repeat the passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Save my data, encrypted' }).click()
  await expect(page.getByText('Your data is now saved on this device, encrypted.')).toBeVisible()

  await nav.getByRole('link', { name: 'Contacts' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Ada')
  await page.getByLabel('Address', { exact: true }).fill(chain.addWallet('ada', 0n))
  await page.getByRole('button', { name: 'Save contact' }).click()
  await expect(page.getByText('Ada was saved.')).toBeVisible()
  // Saves are batched a moment after a change.
  await page.waitForTimeout(1500)

  // A reload locks the app: nothing is readable until the passphrase is given.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible()
  await expect(page.getByText('Ada and Tunde')).toHaveCount(0)
  await page.getByLabel('Passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Unlock' }).click()

  await nav.getByRole('link', { name: 'Contacts' }).click()
  await expect(page.getByRole('button', { name: 'Rename Ada' })).toBeVisible()
  await nav.getByRole('link', { name: 'Blind Pot' }).click()
  await expect(page.getByText(/Ada and Tunde/).first()).toBeVisible()
  expect(link).toContain('#pot=')

  await assertClean([host], baseURL, {
    allowVault: true,
    secretsNotInVault: ['Ada and Tunde', 'Ada'],
  })
  await host.close()
})
