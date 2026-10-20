import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const PASS = 'correct horse battery'
const A = 'utest1adaaddressadaaddressadaaddress'

/** Moves within the app by its own links. (A reload would lock the app again, by design.) */
async function go(page: Page, link: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: link }).click()
}

/** Adds a contact. Opens the page by URL first only when `fresh`; otherwise uses the app's own links. */
async function addContact(page: Page, name: string, address: string, fresh = true) {
  if (fresh) await page.goto('/contacts')
  else await go(page, 'Contacts')
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByLabel('Address', { exact: true }).fill(address)
  await page.getByRole('button', { name: 'Save contact' }).click()
  await expect(page.getByText(`${name} was saved.`)).toBeVisible()
}

/** Makes the vault from Settings. Pass `fresh: false` when there is data on the page that a reload would lose. */
async function createVault(page: Page, passphrase = PASS, fresh = true) {
  if (fresh) await page.goto('/settings')
  else await go(page, 'Settings')
  await page.getByLabel('New passphrase').first().fill(passphrase)
  await page.getByLabel('Repeat the passphrase').fill(passphrase)
  await page.getByRole('button', { name: 'Save my data, encrypted' }).click()
  await expect(page.getByText('Your data is now saved on this device, encrypted.')).toBeVisible()
}

async function unlock(page: Page, passphrase = PASS) {
  await page.getByLabel('Passphrase').fill(passphrase)
  await page.getByRole('button', { name: 'Unlock' }).click()
}

/** Everything in the vault's IndexedDB database, as text, so a test can look for readable data. */
async function rawVault(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        text: string
        stores: string[]
        meta: { iterations: number; saltBytes: number } | null
      }>((resolve, reject) => {
        const open = indexedDB.open('zealed-vault')
        open.onerror = () => {
          reject(new Error('open failed'))
        }
        open.onsuccess = () => {
          const db = open.result
          const stores = Array.from(db.objectStoreNames)
          const tx = db.transaction(stores, 'readonly')
          let text = ''
          let meta: { iterations: number; saltBytes: number } | null = null
          let pending = stores.length
          for (const name of stores) {
            const all = tx.objectStore(name).getAll()
            all.onsuccess = () => {
              for (const value of all.result as unknown[]) {
                if (value instanceof Uint8Array) text += new TextDecoder('latin1').decode(value)
                else if (typeof value === 'object' && value !== null && 'iterations' in value) {
                  const m = value as { iterations: number; salt: Uint8Array }
                  meta = { iterations: m.iterations, saltBytes: m.salt.length }
                  text += JSON.stringify({ iterations: m.iterations })
                }
              }
              if (--pending === 0) {
                db.close()
                resolve({ text, stores, meta })
              }
            }
          }
        }
      }),
  )
}

test.describe('Keeping data on this device, encrypted', () => {
  test('without a passphrase nothing is saved, and the app says so', async ({ page }) => {
    await page.goto('/contacts')
    await expect(page.getByRole('note')).toContainText('Nothing is saved on this device yet')
    await addContact(page, 'Ada', A)
    await page.reload()
    await expect(page.getByText('No contacts yet')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Locked' })).toHaveCount(0)
  })

  test('a passphrase keeps the data across a reload, behind a lock screen, with nothing readable stored', async ({
    page,
  }) => {
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await addContact(page, 'Ada Lovelace', A)
    await createVault(page, PASS, false)
    await expect(page.getByRole('note')).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Locked' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toContain('Ada Lovelace')
    expect(await page.locator('body').innerText()).not.toContain(A)

    // Real key stretching, and nothing but ciphertext in storage.
    const raw = await rawVault(page)
    expect(raw.stores.sort()).toEqual(['meta', 'records'])
    expect(raw.meta).toEqual({ iterations: 600_000, saltBytes: 16 })
    expect(raw.text).not.toContain('Ada Lovelace')
    expect(raw.text).not.toContain(A)
    expect(raw.text).not.toContain(PASS)
    const plainStorage = await page.evaluate(() =>
      JSON.stringify(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
    )
    expect(plainStorage).not.toContain('Ada')
    expect(plainStorage).not.toContain(A)

    // A wrong passphrase is refused and shows nothing; the right one brings everything back.
    await unlock(page, 'definitely not it')
    await expect(page.getByText('That passphrase is not right.')).toBeVisible()
    expect(await page.locator('body').innerText()).not.toContain('Ada Lovelace')
    await unlock(page)
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await go(page, 'Contacts')
    await expect(page.locator('li p', { hasText: 'Ada Lovelace' }).first()).toBeVisible()

    // Setting up and unlocking used only the app's own origin.
    const own = new URL(page.url()).origin
    for (const url of requests) expect(new URL(url).origin).toBe(own)
  })

  test('changes made after unlocking are saved too', async ({ page }) => {
    await createVault(page)
    await addContact(page, 'Bo', 'utest1boaddressboaddressboaddressbo', false)
    await page.waitForTimeout(600)
    await page.reload()
    await unlock(page)
    await go(page, 'Contacts')
    await expect(page.locator('li p', { hasText: 'Bo' }).first()).toBeVisible()
  })

  test('Lock now locks at once and removes the data from the page', async ({ page }) => {
    await addContact(page, 'Ada', A)
    await createVault(page, PASS, false)
    await page.getByRole('button', { name: 'Lock now' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Locked' })).toBeVisible()
    expect(await page.locator('body').innerText()).not.toContain('Ada')
    await unlock(page)
    await go(page, 'Contacts')
    await expect(page.locator('li p', { hasText: 'Ada' }).first()).toBeVisible()
  })

  test('locks itself after the chosen time with no use', async ({ page }) => {
    await page.clock.install()
    await page.goto('/settings')
    await page.getByLabel('Lock after').selectOption('1')
    await createVault(page)
    await page.clock.runFor('00:30')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await page.clock.runFor('00:40')
    await expect(page.getByRole('heading', { level: 1, name: 'Locked' })).toBeVisible()
  })

  test('pausing after five wrong passphrases', async ({ page }) => {
    await createVault(page)
    await page.reload()
    for (let i = 0; i < 5; i++) {
      await unlock(page, `wrong passphrase ${String(i)}`)
      await expect(page.getByLabel('Passphrase')).toHaveValue('')
    }
    await expect(page.getByText(/Too many wrong attempts\. Try again in \d+ seconds/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unlock' })).toBeDisabled()
  })

  test('changing the passphrase re-encrypts everything: the old one stops working', async ({
    page,
  }) => {
    await addContact(page, 'Ada', A)
    await createVault(page, PASS, false)
    await page.getByRole('button', { name: 'Change passphrase' }).click()
    const dialog = page.getByRole('dialog', { name: 'Change your passphrase' })
    await dialog.getByLabel('Current passphrase').fill(PASS)
    await dialog.getByLabel('New passphrase', { exact: true }).fill('a brand new passphrase')
    await dialog.getByLabel('Repeat the new passphrase').fill('a brand new passphrase')
    await dialog.getByRole('button', { name: 'Change' }).click()
    await expect(page.getByText('Passphrase changed.')).toBeVisible()
    await page.reload()
    await unlock(page, PASS)
    await expect(page.getByText('That passphrase is not right.')).toBeVisible()
    await unlock(page, 'a brand new passphrase')
    await go(page, 'Contacts')
    await expect(page.locator('li p', { hasText: 'Ada' }).first()).toBeVisible()
  })

  test('a weak passphrase or a mismatch is refused, and nothing is created', async ({ page }) => {
    await page.goto('/settings')
    await page.getByLabel('New passphrase').first().fill('short')
    await page.getByLabel('Repeat the passphrase').fill('short')
    await page.getByRole('button', { name: 'Save my data, encrypted' }).click()
    await expect(page.getByText(/Use at least 10 characters/)).toBeVisible()
    await page.getByLabel('New passphrase').first().fill(PASS)
    await page.getByLabel('Repeat the passphrase').fill('something different')
    await page.getByRole('button', { name: 'Save my data, encrypted' }).click()
    await expect(page.getByText('The two passphrases do not match.')).toBeVisible()
    expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0)
  })

  test('wiping deletes the vault: afterwards there is no lock screen and no database', async ({
    page,
  }) => {
    await addContact(page, 'Ada', A)
    await createVault(page, PASS, false)
    await page.getByRole('button', { name: 'Wipe all local data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Wipe all local data?' })
    await dialog.getByLabel('Type WIPE').fill('WIPE')
    await dialog.getByRole('button', { name: 'Wipe everything' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Zealed' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Locked' })).toHaveCount(0)
    const databases = await page.evaluate(async () =>
      (await indexedDB.databases()).map((d) => d.name),
    )
    expect(databases.filter((name) => name === 'zealed-vault')).toEqual([])
    await page.goto('/contacts')
    await expect(page.getByText('No contacts yet')).toBeVisible()
  })

  test('the lock screen offers wiping when the passphrase is forgotten', async ({ page }) => {
    await createVault(page)
    await page.reload()
    await page.getByText('Forgot your passphrase?').click()
    await expect(page.getByText(/no way to recover it/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Wipe all local data' })).toBeVisible()
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`the lock screen passes accessibility checks in ${scheme} mode at phone width`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await page.emulateMedia({ colorScheme: scheme })
      await createVault(page)
      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: 'Locked' })).toBeVisible()
      await unlock(page, 'wrong one here')
      await expect(page.getByText('That passphrase is not right.')).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(results.violations.map((v) => v.id)).toEqual([])
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0)
    })
  }
})
