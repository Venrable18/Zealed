import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { build } from 'vite'
import { SimChain } from '../../../src/test/simChain.ts'
import { decodeWire, encodeWire } from '../../../src/test/wire.ts'

/**
 * Multi-actor browser scenarios. Each actor is a separate browser context (its own storage and
 * memory) running the real app screens with a simulated wallet that talks to one shared simulated
 * chain in Node. This is NOT testnet: it stands in for the wallet until the real one exists.
 */
const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}
const BASE = '/__harness/'

export interface Harness {
  dir: string
  html: string
}

let cached: Promise<Harness> | undefined

/** Builds the harness once per worker: the real app plus a simulated wallet provider. */
export function buildHarness(): Promise<Harness> {
  cached ??= (async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zealed-harness-'))
    await build({
      configFile: 'vite.config.ts',
      logLevel: 'silent',
      base: BASE,
      build: { outDir: dir, emptyOutDir: true, rollupOptions: { input: 'src/test/harness.html' } },
    })
    return { dir, html: readFileSync(join(dir, 'src/test/harness.html'), 'utf8') }
  })()
  return cached
}

export function cleanHarness(harness: Harness): void {
  rmSync(harness.dir, { recursive: true, force: true })
  cached = undefined
}

export interface Actor {
  id: string
  context: BrowserContext
  page: Page
  address: string
  /** Every URL this actor's page requested. */
  requests: string[]
  /** Console errors and page errors. */
  problems: string[]
  /** Every other console message. The app is not meant to log anything. */
  logs: string[]
  /** Requests to other origins, with the Referer header each carried (there should be none). */
  referers: string[]
  /** The longest time the page's main thread was blocked, in milliseconds (long-task API). */
  longestTask: () => Promise<number>
  close: () => Promise<void>
}

export interface ActorOptions {
  /** Starting funds, in zatoshis. Defaults to 1,000 ZEC. */
  fundsZat?: bigint
  /** Routes to add to this actor's context, for example to block drand. */
  setup?: (context: BrowserContext) => Promise<void>
}

/** Creates a wallet on the chain and a browser context running the app with that wallet. */
export async function newActor(
  browser: Browser,
  harness: Harness,
  chain: SimChain,
  baseURL: string,
  id: string,
  options: ActorOptions = {},
): Promise<Actor> {
  const address = chain.addWallet(id, options.fundsZat ?? 1000n * 100_000_000n)
  const context = await browser.newContext({ baseURL, acceptDownloads: true })
  await context.exposeFunction(
    'simChain',
    (walletId: string, method: string, argsJson: string): string => {
      try {
        return encodeWire(chain.call(walletId, method, decodeWire(argsJson) as unknown[]))
      } catch (error) {
        // The page's wallet client turns a thrown error into a failed call, like a real wallet would.
        throw new Error(error instanceof Error ? error.message : 'wallet error', { cause: error })
      }
    },
  )
  await context.addInitScript((walletId) => {
    ;(window as unknown as { __simWalletId: string }).__simWalletId = walletId
    // Record the longest stretch the main thread was blocked, to check the UI stays responsive.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const w = window as unknown as { __longest?: number }
        w.__longest = Math.max(w.__longest ?? 0, entry.duration)
      }
    }).observe({ type: 'longtask', buffered: true })
  }, id)

  const origin = new URL(baseURL).origin
  // Serve the harness's own files, and answer page loads with the harness page (keeping the real security headers).
  await context.route(`${origin}${BASE}**`, async (route) => {
    const path = new URL(route.request().url()).pathname.slice(BASE.length)
    try {
      await route.fulfill({
        status: 200,
        contentType: TYPES[extname(path)] ?? 'application/octet-stream',
        body: readFileSync(join(harness.dir, path)),
      })
    } catch {
      await route.fulfill({ status: 404, body: 'not found' })
    }
  })
  await context.route(`${origin}/**`, async (route) => {
    const request = route.request()
    if (request.resourceType() !== 'document' || new URL(request.url()).pathname.startsWith(BASE))
      return route.fallback()
    const response = await route.fetch()
    return route.fulfill({ response, body: harness.html })
  })
  if (options.setup !== undefined) await options.setup(context)

  const page = await context.newPage()
  const requests: string[] = []
  const problems: string[] = []
  const logs: string[] = []
  const referers: string[] = []
  page.on('request', (request) => {
    requests.push(request.url())
    if (new URL(request.url()).origin !== origin && request.headers()['referer'] !== undefined)
      referers.push(request.url())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
    else logs.push(`${message.type()}: ${message.text()}`)
  })
  const longestTask = () =>
    page.evaluate(() => (window as unknown as { __longest?: number }).__longest ?? 0)
  return {
    id,
    context,
    page,
    address,
    requests,
    problems,
    logs,
    referers,
    longestTask,
    close: () => context.close(),
  }
}

type Forge = 'unsignedMemos' | 'forgedCheckIn' | 'forgedRevoke'

/** Asks an actor's page to build memos the app would never send (underpaid, forged), as bytes. */
export async function forgeMemos(
  page: Page,
  kind: Forge,
  ...args: (string | number)[]
): Promise<Uint8Array[]> {
  const encoded = await page.evaluate(
    ([name, params]) =>
      (window as unknown as { __zealed: Record<string, (...a: unknown[]) => string[]> }).__zealed[
        name as string
      ]?.(...(params as unknown[])) ?? [],
    [kind, args] as const,
  )
  return encoded.map((b64) => Uint8Array.from(Buffer.from(b64, 'base64')))
}

/** The IDs of the letters an actor guards. The screens never show them; the harness reads the store. */
export async function guardedBundleIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (
      window as unknown as { __zealed: { guardedBundleIds: () => string[] } }
    ).__zealed.guardedBundleIds(),
  )
}
