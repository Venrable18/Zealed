import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { build } from 'vite'

/**
 * The crypto modules are written for the browser but their unit tests run in Node. This bundles
 * them the way Vite does for the app and runs the real flows in Chromium, to catch problems that
 * only appear there (missing globals, module formats). Timelock uses recorded beacons, not the
 * network.
 */
let script = ''
let outDir = ''

test.beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'zealed-crypto-'))
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: 'src/crypto/browserCheck.entry.ts',
        formats: ['iife'],
        name: 'zealedCrypto',
        fileName: () => 'crypto.js',
      },
    },
  })
  script = readFileSync(join(outDir, 'crypto.js'), 'utf8')
})

test.afterAll(() => {
  rmSync(outDir, { recursive: true, force: true })
})

test('AES, Shamir, Ed25519, timelock and both bundle modes work in the browser', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // Serve the bundle from the app's own origin: WebCrypto needs a secure context, and the app's
  // CSP only allows scripts from 'self', so this also runs the code under the real policy.
  await page.route('**/crypto-check.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: script }),
  )
  await page.goto('/')
  await page.addScriptTag({ url: '/crypto-check.js' })
  const result = await page.evaluate(() =>
    (globalThis as unknown as { runCrypto: () => Promise<unknown> }).runCrypto(),
  )

  expect(result).toEqual({
    aes: 'hello',
    shamir: true,
    sig: 2,
    tlock: 'a letter',
    guardians: 'a letter',
  })
  expect(errors).toEqual([])
})
