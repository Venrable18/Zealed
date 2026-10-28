import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('guided tour', () => {
  test('opens from the sidebar, lights each part, and can be walked through to the end', async ({
    page,
  }) => {
    await page.goto('/app')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Take the tour' }).last().click()
    const tour = page.getByRole('dialog', { name: 'Guided tour' })
    await expect(tour).toContainText('Welcome to Zealed')
    for (let step = 2; step <= 8; step++) {
      await tour.getByRole('button', { name: 'Next' }).click()
      await expect(tour).toContainText(`Step ${String(step)} of 8`)
    }
    await tour.getByRole('button', { name: 'Start using Zealed' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('?tour=1 opens it on arrival, and Escape closes it', async ({ page }) => {
    await page.goto('/app?tour=1')
    await expect(page.getByRole('dialog', { name: 'Guided tour' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`passes accessibility checks in ${scheme} mode, on a step that points at the sidebar`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/app?tour=1')
      const tour = page.getByRole('dialog', { name: 'Guided tour' })
      await tour.getByRole('button', { name: 'Next' }).click()
      await tour.getByRole('button', { name: 'Next' }).click()
      await expect(tour).toContainText('Legacy')
      const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('on a phone it speaks from the middle of the screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/app?tour=1')
    const tour = page.getByRole('dialog', { name: 'Guided tour' })
    await tour.getByRole('button', { name: 'Next' }).click()
    await expect(tour).toContainText('Your numbers')
    const box = await tour.boundingBox()
    expect(box).not.toBeNull()
    if (box === null) return
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
  })
})
