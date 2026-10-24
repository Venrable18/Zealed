import { expect, test } from '@playwright/test'
import { allowedConnectOrigins } from '../../src/config/network.ts'

const DEV_HMR_SOURCES = ['ws://localhost:*', 'ws://127.0.0.1:*']

function directive(csp: string, name: string): string[] {
  const entry = csp
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([directiveName]) => directiveName === name)
  return entry?.slice(1) ?? []
}

test('serves cross-origin isolation and a strict CSP', async ({ page, baseURL }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  const response = await page.goto('/')
  if (response === null) throw new Error('no response for /')
  const headers = response.headers()

  expect(headers['cross-origin-opener-policy']).toBe('same-origin')
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp')
  expect(headers['referrer-policy']).toBe('no-referrer')

  const csp = headers['content-security-policy'] ?? ''
  expect(directive(csp, 'default-src')).toEqual(["'none'"])
  expect(csp).not.toContain('unsafe-inline')
  const connectSources = directive(csp, 'connect-src').filter(
    (source) => !DEV_HMR_SOURCES.includes(source),
  )
  expect(connectSources).toEqual(["'self'", ...allowedConnectOrigins()])

  // The app rendered (so the dev CSP nonce covered React Refresh) and is cross-origin isolated.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true)
  expect(errors).toEqual([])

  // Loading the app touches no host other than its own.
  const appOrigin = new URL(baseURL ?? '').origin
  for (const url of requests) expect(new URL(url).origin).toBe(appOrigin)
})

test('blocks connections outside the allowlist', async ({ page }) => {
  // Never let the probe reach the network, even if the CSP were missing.
  await page.route('https://example.com/**', (route) => route.abort())
  await page.goto('/')

  const outcome = await page.evaluate(async () => {
    const violation = new Promise<string>((resolve) => {
      document.addEventListener(
        'securitypolicyviolation',
        (event) => {
          resolve(event.effectiveDirective)
        },
        { once: true },
      )
    })
    const fetched = await fetch('https://example.com/').then(
      () => 'allowed',
      () => 'blocked',
    )
    return { fetched, directive: await violation }
  })

  expect(outcome).toEqual({ fetched: 'blocked', directive: 'connect-src' })
})
