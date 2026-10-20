import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { encodeContact } from '../../src/features/contacts/contacts.ts'

const A = 'utest1adaaddressadaaddressadaaddress'
const B = 'utest1boaddressboaddressboaddressbo'

const go = (page: Page, link: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: link }).click()

async function add(page: Page, name: string, address: string) {
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByLabel('Address', { exact: true }).fill(address)
  await page.getByRole('button', { name: 'Save contact' }).click()
  await expect(page.getByText(`${name} was saved.`)).toBeVisible()
}

test.describe('Contacts', () => {
  test('is empty at first, explains mistakes, and saves a contact', async ({ page }) => {
    await page.goto('/contacts')
    await expect(page.getByText('No contacts yet')).toBeVisible()
    await page.getByRole('button', { name: 'Save contact' }).click()
    await expect(page.getByText('Give this contact a name.')).toBeVisible()
    await expect(page.getByText('Enter an address.')).toBeVisible()
    await page.getByLabel('Name', { exact: true }).fill('Ada')
    await page.getByLabel('Address', { exact: true }).fill('not an address')
    await page.getByRole('button', { name: 'Save contact' }).click()
    await expect(page.getByText('That does not look like a Zcash address.')).toBeVisible()
    await page.getByLabel('Address', { exact: true }).fill(A)
    await page.getByRole('button', { name: 'Save contact' }).click()
    await expect(page.getByText('Ada was saved.')).toBeVisible()
    await expect(page.locator('li p', { hasText: A })).toBeVisible()
  })

  test('refuses a duplicate address, renames, and asks before removing', async ({ page }) => {
    await page.goto('/contacts')
    await add(page, 'Ada', A)
    await page.getByLabel('Name', { exact: true }).fill('Again')
    await page.getByLabel('Address', { exact: true }).fill(A)
    await page.getByRole('button', { name: 'Save contact' }).click()
    await expect(page.getByText('Already saved as Ada.')).toBeVisible()

    await page.getByRole('button', { name: 'Rename Ada' }).click()
    await page.getByLabel('New name for Ada').fill('Ada L.')
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(page.locator('li p', { hasText: 'Ada L.' })).toBeVisible()

    await page.getByRole('button', { name: 'Remove Ada L.' }).click()
    const dialog = page.getByRole('dialog', { name: 'Remove Ada L.?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('No contacts yet')).toBeVisible()
  })

  test('a contact link adds someone, and never sends the contact to the server', async ({
    page,
  }) => {
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await page.goto(`/add#${encodeContact({ address: A, name: 'Ada' })}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Add a contact' })).toBeVisible()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada')
    await expect(page.getByText(A)).toBeVisible()
    await page.getByLabel('Name', { exact: true }).fill('Ada, my sister')
    await page.getByRole('button', { name: 'Save contact' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible()
    await expect(page.locator('li p', { hasText: 'Ada, my sister' })).toBeVisible()
    for (const url of requests) {
      expect(url).not.toContain('utest1')
      expect(url).not.toContain('Ada')
    }
  })

  test('a broken contact link says so, and a hostile name is shown as text', async ({ page }) => {
    for (const hash of ['', '#garbage', '#' + 'A'.repeat(2000)]) {
      await page.goto(`/add${hash}`)
      await expect(page.getByText('This link does not look right')).toBeVisible()
    }
    await page.goto('/contacts')
    await add(page, '<img src=x onerror=alert(1)>', A)
    await expect(page.locator('li p', { hasText: '<img src=x onerror=alert(1)>' })).toBeVisible()
    await expect(page.locator('main img')).toHaveCount(0)
  })

  test('saved contacts can be picked in the Legacy forms, so no address is typed', async ({
    page,
  }) => {
    await page.goto('/contacts')
    await add(page, 'Ada', A)
    await add(page, 'Bo', B)
    await go(page, 'Legacy')
    await expect(page.getByRole('heading', { level: 1, name: 'Legacy' })).toBeVisible()
    const recipient = page.getByLabel(/Recipient/)
    await page.getByLabel('Choose a saved contact').first().selectOption({ label: 'Bo' })
    await expect(recipient).toHaveValue(B)
    await expect(page.getByText('Saved contact: Bo')).toBeVisible()

    await page.getByRole('link', { name: /opens only if you go silent/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'If I go silent' })).toBeVisible()
    await page.getByLabel('Choose a saved contact').first().selectOption({ label: 'Ada' })
    await expect(page.getByLabel(/Heir’s Zealed address/)).toHaveValue(A)
    await page.getByLabel('Choose a saved contact').nth(1).selectOption({ label: 'Bo' })
    await expect(page.getByLabel('Guardian 1 address')).toHaveValue(B)
  })

  test('the address field offers scanning, and opens the camera on request', async ({ page }) => {
    await page.goto('/legacy')
    await expect(page.getByRole('button', { name: 'Scan a QR code' })).toBeVisible()
    await expect(page.getByLabel('Choose a saved contact')).toHaveCount(0)
  })

  test('Receive says there is no wallet yet, and the dashboard reminds nothing is saved', async ({
    page,
  }) => {
    await page.goto('/receive')
    await expect(page.getByRole('heading', { level: 1, name: 'Receive' })).toBeVisible()
    await expect(page.getByText('No wallet yet')).toBeVisible()
    await go(page, 'Dashboard')
    await expect(page.getByRole('note').first()).toContainText(
      'Nothing is saved on this device yet',
    )
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`the add-contact page and a filled Contacts page pass accessibility checks in ${scheme} mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(`/add#${encodeContact({ address: A, name: 'Ada' })}`)
      await expect(page.getByRole('heading', { level: 1, name: 'Add a contact' })).toBeVisible()
      const first = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(first.violations.map((v) => v.id)).toEqual([])
      await page.getByRole('button', { name: 'Save contact' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible()
      const second = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(second.violations.map((v) => v.id)).toEqual([])
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0)
    })
  }
})
