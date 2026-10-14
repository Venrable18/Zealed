import { describe, expect, it } from 'vitest'
import { encodeChunk, splitMessage } from '../../zmp/index.ts'
import { batchWindow, describeInterval } from './batching.ts'
import { FakeWallet, wishMemo } from './fakeWallet.ts'
import { buildHostView } from './hostView.ts'
import { isValidDate, newPot, todayString, validatePotInput, type PotInput } from './pot.ts'
import { closePot, createPot } from './service.ts'
import {
  buildZip321,
  decodeShare,
  encodeShare,
  readShareFromHash,
  shareUrl,
  type SharedPot,
} from './shareLink.ts'
import { privacyStrength } from './strength.ts'
import type { Pot } from './types.ts'
import { decodeWish, seededShuffle } from './wishes.ts'

/** UTF-8 safe base64url, the same format the share link uses. */
function b64url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromB64url(encoded: string): string {
  const padded = encoded
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(encoded.length / 4) * 4, '=')
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))
}

const ADDRESS = 'utest1fakeaddressfakeaddressfakeaddress'
const MINUTE = 60_000
const goodInput: PotInput = {
  name: "Ada's wedding",
  cover: '🎁',
  eventDate: '2026-12-01',
  endDate: '2026-12-31',
}

function pot(overrides: Partial<Pot> = {}): Pot {
  return {
    id: 'a'.repeat(32),
    name: 'Test pot',
    cover: '',
    eventDate: '2026-12-01',
    endDate: '2026-12-31',
    batchIntervalMs: 60 * MINUTE,
    createdAtMs: 0,
    accountId: 'acct-1',
    address: ADDRESS,
    closed: false,
    ...overrides,
  }
}

describe('validatePotInput', () => {
  it('accepts a good pot and trims the name', () => {
    const result = validatePotInput({ ...goodInput, name: '  Ada  ' }, '2026-10-14')
    expect(result).toEqual({ ok: true, value: { ...goodInput, name: 'Ada' } })
  })

  it('reports each problem on its own field', () => {
    const result = validatePotInput(
      { name: ' ', cover: 'ab', eventDate: '', endDate: '2026-02-30' },
      '2026-10-14',
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(['cover', 'endDate', 'eventDate', 'name'])
  })

  it('checks date order and that the last day is not in the past', () => {
    expect(validatePotInput({ ...goodInput, endDate: '2026-11-30' }, '2026-10-14')).toMatchObject({
      ok: false,
      errors: { endDate: expect.stringContaining('before the event') as string },
    })
    expect(
      validatePotInput(
        { ...goodInput, eventDate: '2026-09-01', endDate: '2026-10-01' },
        '2026-10-14',
      ),
    ).toMatchObject({
      ok: false,
      errors: { endDate: expect.stringContaining('past') as string },
    })
  })

  it('limits the name and rejects control characters', () => {
    expect(validatePotInput({ ...goodInput, name: 'x'.repeat(61) }, '2026-10-14').ok).toBe(false)
    expect(validatePotInput({ ...goodInput, name: 'bad\u0007name' }, '2026-10-14').ok).toBe(false)
    expect(validatePotInput({ ...goodInput, name: 'x'.repeat(60) }, '2026-10-14').ok).toBe(true)
  })

  it('counts an emoji with modifiers as one character', () => {
    expect(validatePotInput({ ...goodInput, cover: '👩🏽‍❤️‍👨🏿' }, '2026-10-14').ok).toBe(true)
    expect(validatePotInput({ ...goodInput, cover: '🎁🎁' }, '2026-10-14').ok).toBe(false)
  })

  it('knows real dates', () => {
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2027-02-29')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('26-1-1')).toBe(false)
    expect(todayString(new Date(2026, 9, 5, 12).getTime())).toBe('2026-10-05')
  })
})

describe('share link', () => {
  const shared: SharedPot = {
    id: 'b'.repeat(32),
    name: 'Ada & Tunde 🎉',
    cover: '🎁',
    eventDate: '2026-12-01',
    endDate: '2026-12-31',
    address: ADDRESS,
  }

  it('round-trips, including non-ASCII text', () => {
    expect(decodeShare(encodeShare(shared))).toEqual(shared)
  })

  it('puts the data in the URL fragment, never the path or query', () => {
    const url = new URL(shareUrl('https://zealed.example', shared))
    expect(url.search).toBe('')
    expect(url.pathname).toBe('/blind-pot/give')
    expect(url.hash.startsWith('#pot=')).toBe(true)
    expect(readShareFromHash(url.hash)).toEqual(shared)
    expect(readShareFromHash('#other=abc')).toBeNull()
  })

  it('does not include anything beyond what a contributor needs', () => {
    const { v, ...rest } = JSON.parse(fromB64url(encodeShare(shared))) as Record<string, unknown>
    expect(v).toBe(1)
    expect(Object.keys(rest).sort()).toEqual([
      'address',
      'cover',
      'endDate',
      'eventDate',
      'id',
      'name',
    ])
  })

  it('rejects hostile or broken input without throwing', () => {
    const encode = (value: unknown) => b64url(JSON.stringify(value))
    const base = { v: 1, ...shared }
    for (const bad of [
      '',
      'not base64!',
      'A'.repeat(2001),
      b64url('{"v":1'),
      encode(null),
      encode([]),
      encode({ ...base, v: 2 }),
      encode({ ...base, id: 'short' }),
      encode({ ...base, name: '' }),
      encode({ ...base, name: 'x'.repeat(200) }),
      encode({ ...base, eventDate: '2026-02-30' }),
      encode({ ...base, address: 'has spaces & symbols' }),
      encode({ ...base, address: 42 }),
    ]) {
      expect(decodeShare(bad)).toBeNull()
    }
  })

  it('builds a ZIP 321 request that wallets can read', () => {
    expect(buildZip321({ address: ADDRESS })).toBe(`zcash:${ADDRESS}`)
    const uri = buildZip321({ address: ADDRESS, label: 'Ada & Tunde? #1 = 100% 🎁' })
    expect(uri).toBe(
      `zcash:${ADDRESS}?label=Ada%20%26%20Tunde%3F%20%231%20%3D%20100%25%20%F0%9F%8E%81`,
    )
    // Only one parameter, so no label content can smuggle in another one.
    expect(new URL(uri).searchParams.get('label')).toBe('Ada & Tunde? #1 = 100% 🎁')
    expect(Array.from(new URL(uri).searchParams.keys())).toEqual(['label'])
    expect(() => buildZip321({ address: 'x?amount=1' })).toThrow(RangeError)
  })
})

describe('batching', () => {
  it('finds the last and next boundary', () => {
    expect(batchWindow(150 * MINUTE, 0, 60 * MINUTE)).toEqual({
      lastMs: 120 * MINUTE,
      nextMs: 180 * MINUTE,
    })
    expect(batchWindow(60 * MINUTE, 0, 60 * MINUTE)).toEqual({
      lastMs: 60 * MINUTE,
      nextMs: 120 * MINUTE,
    })
    expect(batchWindow(30 * MINUTE, 10 * MINUTE, 60 * MINUTE)).toEqual({
      lastMs: 10 * MINUTE,
      nextMs: 70 * MINUTE,
    })
  })

  it('treats a clock before the start as the first window, and rejects a bad interval', () => {
    expect(batchWindow(-5, 100, 60)).toEqual({ lastMs: 100, nextMs: 160 })
    expect(() => batchWindow(0, 0, 0)).toThrow(RangeError)
  })

  it('describes intervals', () => {
    expect(describeInterval(60 * MINUTE)).toBe('1 hour')
    expect(describeInterval(90 * MINUTE)).toBe('90 minutes')
    expect(describeInterval(60_000)).toBe('1 minute')
    expect(describeInterval(30_000)).toBe('30 seconds')
  })
})

describe('wishes', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)

  it('accepts normal wishes, including emoji and non-English text', () => {
    expect(decodeWish(bytes('  Happy wedding! 🎉  '))).toBe('Happy wedding! 🎉')
    expect(decodeWish(bytes('Chúc mừng'))).toBe('Chúc mừng')
  })

  it('enforces the 140-character limit by characters the person sees', () => {
    expect(decodeWish(bytes('a'.repeat(140)))).not.toBeNull()
    expect(decodeWish(bytes('a'.repeat(141)))).toBeNull()
    expect(decodeWish(bytes('🎉'.repeat(140)))).not.toBeNull()
  })

  it('rejects empty, invalid UTF-8, control and bidi-override characters', () => {
    expect(decodeWish(new Uint8Array(0))).toBeNull()
    expect(decodeWish(bytes('   '))).toBeNull()
    expect(decodeWish(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull()
    expect(decodeWish(bytes('hi\u0000there'))).toBeNull()
    expect(decodeWish(bytes('abc‮def'))).toBeNull()
    expect(decodeWish(new Uint8Array(2000).fill(97))).toBeNull()
  })

  it('shuffles deterministically and keeps every item', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    const a = seededShuffle(items, 'pot:1')
    expect(seededShuffle(items, 'pot:1')).toEqual(a)
    expect(seededShuffle(items, 'pot:2')).not.toEqual(a)
    expect([...a].sort((x, y) => x - y)).toEqual(items)
    expect(a).not.toEqual(items)
    expect(items).toEqual(Array.from({ length: 30 }, (_, i) => i))
  })
})

describe('privacyStrength', () => {
  it('moves from none to strong as pieces arrive', () => {
    expect([0, 1, 5, 6, 23, 24, 500].map(privacyStrength)).toEqual([
      'none',
      'weak',
      'weak',
      'medium',
      'medium',
      'strong',
      'strong',
    ])
  })
})

describe('buildHostView (with a test-double wallet)', () => {
  const HOUR = 60 * MINUTE

  it('shows the total as of the last boundary, not gifts that arrived since', async () => {
    const wallet = new FakeWallet()
    wallet.payments.push(
      { atMs: 10 * MINUTE, zat: 100_000n },
      { atMs: 50 * MINUTE, zat: 200_000n },
      { atMs: 70 * MINUTE, zat: 500_000n },
    )
    const view = await buildHostView(wallet, pot(), 90 * MINUTE)
    expect(view.totalZat).toBe(300_000n)
    expect(view.asOfMs).toBe(HOUR)
    expect(view.nextUpdateMs).toBe(2 * HOUR)
    expect(wallet.calls.every((call) => call.atMs === HOUR)).toBe(true)
  })

  it('gives the same answer however often or whenever the host looks within a batch', async () => {
    const wallet = new FakeWallet()
    wallet.payments.push(
      { atMs: 5 * MINUTE, zat: 100_000n, wish: 'one' },
      { atMs: 20 * MINUTE, zat: 100_000n, wish: 'two' },
      { atMs: 70 * MINUTE, zat: 100_000n },
    )
    const early = await buildHostView(wallet, pot(), 61 * MINUTE)
    const late = await buildHostView(wallet, pot(), 119 * MINUTE)
    expect(late).toEqual(early)
    wallet.payments.push({ atMs: 100 * MINUTE, zat: 900_000n })
    expect(await buildHostView(wallet, pot(), 119 * MINUTE)).toEqual(early)
    expect((await buildHostView(wallet, pot(), 121 * MINUTE)).totalZat).toBe(1_200_000n)
  })

  it('only ever exposes totals, strength and wish text', async () => {
    const wallet = new FakeWallet()
    wallet.payments.push({ atMs: MINUTE, zat: 100_000n, wish: 'Best wishes' })
    const view = await buildHostView(wallet, pot(), 2 * HOUR)
    expect(Object.keys(view).sort()).toEqual([
      'asOfMs',
      'nextUpdateMs',
      'strength',
      'totalZat',
      'wishes',
    ])
    expect(view.wishes).toEqual(['Best wishes'])
  })

  it('ignores memos that are not valid wishes', async () => {
    const wallet = new FakeWallet()
    wallet.payments.push({ atMs: MINUTE, zat: 1n, wish: 'Real wish' })
    const other = encodeChunk(splitMessage('NUDGE', new TextEncoder().encode('not a wish'))[0]!)
    const text = new TextEncoder().encode('plain text memo')
    wallet.memosAsOf = (_id, atMs) =>
      Promise.resolve(
        [wishMemo('Real wish'), other, text, wishMemo(''), wishMemo('x'.repeat(141))].slice(
          0,
          atMs > 0 ? 5 : 0,
        ),
      )
    expect((await buildHostView(wallet, pot(), 2 * HOUR)).wishes).toEqual(['Real wish'])
  })

  it('shuffles wishes, and differently in the next batch', async () => {
    const wallet = new FakeWallet()
    const texts = Array.from({ length: 20 }, (_, i) => `wish ${String(i)}`)
    texts.forEach((wish, i) => wallet.payments.push({ atMs: i * MINUTE, zat: 1n, wish }))
    const first = await buildHostView(wallet, pot(), HOUR + 1)
    const next = await buildHostView(wallet, pot(), 2 * HOUR + 1)
    expect([...first.wishes].sort()).toEqual([...texts].sort())
    expect(first.wishes).not.toEqual(texts)
    expect(next.wishes).not.toEqual(first.wishes)
  })
})

describe('service', () => {
  const options = { nowMs: new Date(2026, 9, 14).getTime(), batchIntervalMs: 60 * MINUTE }

  it('creates a pot through the wallet', async () => {
    const result = await createPot(new FakeWallet(), goodInput, options)
    expect(result.ok && result.pot).toMatchObject({
      name: "Ada's wedding",
      accountId: 'acct-1',
      closed: false,
      createdAtMs: options.nowMs,
    })
  })

  it('does not touch the wallet when the input is invalid', async () => {
    const wallet = new FakeWallet()
    let touched = false
    wallet.createPotAccount = () => {
      touched = true
      return Promise.resolve({ accountId: 'x', address: ADDRESS })
    }
    expect(await createPot(wallet, { ...goodInput, name: '' }, options)).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
    expect(touched).toBe(false)
  })

  it('says so when there is no wallet or the wallet fails, and creates nothing', async () => {
    expect(await createPot(null, goodInput, options)).toEqual({
      ok: false,
      reason: 'wallet-unavailable',
    })
    const wallet = new FakeWallet()
    wallet.failNext = 'create'
    expect(await createPot(wallet, goodInput, options)).toEqual({
      ok: false,
      reason: 'wallet-error',
    })
  })

  it('closes a pot through the wallet and reports failure without details', async () => {
    const wallet = new FakeWallet()
    expect(await closePot(wallet, pot())).toEqual({ ok: true, txid: 'tx-1' })
    wallet.failNext = 'withdraw'
    expect(await closePot(wallet, pot())).toEqual({ ok: false })
  })

  it('gives every pot a different random id', () => {
    const account = { accountId: 'a', address: ADDRESS }
    const a = newPot(goodInput, account, options)
    expect(a.id).toMatch(/^[0-9a-f]{32}$/)
    expect(newPot(goodInput, account, options).id).not.toBe(a.id)
  })
})
