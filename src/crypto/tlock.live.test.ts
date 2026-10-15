import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRAND } from '../config/network.ts'
import { generateKey } from './aes.ts'
import { openTimelocked, sealTimelocked } from './bundle.ts'
import { lockKey, quicknetClient, roundForUnlock, timeOfRound, unlockKey } from './tlock.ts'

/**
 * Runs against the real drand quicknet network, so it needs the internet and takes about 15
 * seconds. Skipped unless LIVE_DRAND=1. Run with `npm run test:live`.
 */
const live = process.env['LIVE_DRAND'] === '1'
const DELAY_MS = 10_000

afterEach(() => {
  vi.restoreAllMocks()
})

async function waitUntil(timeMs: number) {
  const wait = timeMs - Date.now() + 1500
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}

describe.skipIf(!live)('tlock against the live drand quicknet', () => {
  it('locks a key a few seconds ahead, refuses early, then opens it once the round is published', async () => {
    const hosts = new Set<string>()
    const realFetch = globalThis.fetch.bind(globalThis)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      hosts.add(new URL(url).origin)
      return realFetch(input, init)
    })

    const client = quicknetClient()
    const key = generateKey()
    const unlockMs = Date.now() + DELAY_MS
    const locked = await lockKey(key, unlockMs, client)
    expect(locked.round).toBe(roundForUnlock(unlockMs))

    // The device clock says it is too early.
    await expect(unlockKey(locked, { client })).rejects.toMatchObject({ code: 'not-yet' })
    // Skip the clock check: the network itself must refuse a round it has not published.
    await expect(
      unlockKey(locked, { client, nowMs: Date.now() + 10 * 60_000 }),
    ).rejects.toMatchObject({ code: 'unlock-failed' })

    await waitUntil(timeOfRound(locked.round))
    const opened = await unlockKey(locked, { client })
    expect(opened).toEqual(key)

    expect([...hosts]).toEqual([DRAND.baseUrl])
  }, 60_000)

  it('seals and opens a whole Mode A bundle', async () => {
    const content = { letter: 'See you on the other side.', giftSeed: 'abandon abandon abandon' }
    const unlockMs = Date.now() + DELAY_MS
    const sealed = await sealTimelocked({ content, unlockMs, nowMs: Date.now() })
    await expect(openTimelocked(sealed.bundle)).rejects.toMatchObject({ code: 'not-yet' })
    await waitUntil(timeOfRound(sealed.round))
    expect(await openTimelocked(sealed.bundle)).toEqual(content)
  }, 60_000)
})
