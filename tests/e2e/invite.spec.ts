import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/** An invitation made by the app for the name "Ada" (see invite.ts). */
function invitePath(owner?: string) {
  const json = JSON.stringify({ v: 1, r: 'guardian', ...(owner === undefined ? {} : { o: owner }) })
  return `/invite#${Buffer.from(json).toString('base64url')}`
}

test.describe('guardian invitation', () => {
  test('a broken link says so and shows nothing else', async ({ page }) => {
    await page.goto('/invite#nonsense')
    await expect(page.getByText('This invitation does not look right')).toBeVisible()
    await page.goto('/invite')
    await expect(page.getByText('This invitation does not look right')).toBeVisible()
  })

  test('a good link explains the role and, with no wallet, says there is no address yet', async ({
    page,
  }) => {
    await page.goto(invitePath('Ada'))
    await expect(page.getByRole('heading', { level: 1, name: 'Guardian invitation' })).toBeVisible()
    await expect(page.getByText('Ada asks you to be a guardian.')).toBeVisible()
    await expect(page.getByText(/Anyone can make an invitation/)).toBeVisible()
    await expect(page.getByText('What a guardian does')).toBeVisible()
    await expect(page.getByText('No wallet yet')).toBeVisible()
  })

  test('the owner can make an invitation from the guardian setup', async ({ page }) => {
    await page.goto('/legacy/silent')
    await page.getByText('Invite a guardian').click()
    await page.getByLabel('Your name (optional)').fill('Ada')
    const link = await page.getByLabel('Invitation link').inputValue()
    expect(new URL(link).pathname).toBe('/invite')
    expect(new URL(link).search).toBe('')
    await page.goto(new URL(link).pathname + new URL(link).hash)
    await expect(page.getByText('Ada asks you to be a guardian.')).toBeVisible()
  })

  test('the invitation sends nothing to any server', async ({ page, baseURL }) => {
    const seen: string[] = []
    page.on('request', (request) => seen.push(request.url()))
    await page.goto(invitePath('Ada'))
    await expect(page.getByText('Ada asks you to be a guardian.')).toBeVisible()
    await page.waitForTimeout(500)
    const own = new URL(baseURL ?? '').origin
    expect(seen.filter((url) => new URL(url).origin !== own)).toEqual([])
    expect(seen.filter((url) => url.includes('#') || /invite\?|Ada/.test(url))).toEqual([])
  })

  test.describe('phone width and accessibility', () => {
    test.use({ viewport: { width: 360, height: 740 } })
    for (const scheme of ['light', 'dark'] as const) {
      test(`the invitation page in ${scheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto(invitePath('Ada'))
        await expect(page.getByText('Ada asks you to be a guardian.')).toBeVisible()
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(0)
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
      })
    }
  })
})
