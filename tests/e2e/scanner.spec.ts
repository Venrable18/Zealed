import { expect, test } from '@playwright/test'

// A fake camera, so the scanner can be exercised without hardware or a permission prompt.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
})

test('opens the camera on request and releases it on cancel', async ({ page }) => {
  // Record every camera stream the page opens so we can check the tracks really stop.
  await page.addInitScript(() => {
    const streams: MediaStream[] = []
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints)
      streams.push(stream)
      return stream
    }
    Object.assign(window, { openedStreams: streams })
  })

  await page.goto('/components')
  await page.getByRole('button', { name: 'Scan a QR code' }).click()
  await expect(page.getByLabel('Camera view for scanning a QR code')).toBeVisible()
  await expect(page.getByText('Point the camera at the QR code.')).toBeVisible()

  const states = () =>
    page.evaluate(() =>
      (window as unknown as { openedStreams: MediaStream[] }).openedStreams.flatMap((stream) =>
        stream.getTracks().map((track) => track.readyState),
      ),
    )
  // In development React opens the camera twice and closes the first at once; that is fine.
  expect(await states()).toContain('live')

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByLabel('Camera view for scanning a QR code')).toBeHidden()
  const after = await states()
  expect(after.length).toBeGreaterThan(0)
  expect(after.every((state) => state === 'ended')).toBe(true)
})
