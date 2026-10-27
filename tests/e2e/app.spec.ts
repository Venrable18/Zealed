import { expect, test } from '@playwright/test'

test('demo mode turns on with ?demo=1, survives a reload and turns off with ?demo=0', async ({
  page,
}) => {
  const badge = page.getByText('Demo mode')

  await page.goto('/app?demo=1')
  await expect(badge).toBeVisible()

  await page.goto('/app')
  await expect(badge).toBeVisible()

  await page.goto('/app?demo=0')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(badge).toBeHidden()
})

test('unknown routes render the not-found page', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to home' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
})
