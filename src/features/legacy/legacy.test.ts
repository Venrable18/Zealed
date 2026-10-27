import { describe, expect, it } from 'vitest'
import { decodeBundle, sealForGuardians } from '../../crypto/bundle.ts'
import { FIXTURE_ROUNDS, fixtureClient } from '../../crypto/testClient.ts'
import { timeOfRound } from '../../crypto/tlock.ts'
import { decodeMemo, encodeChunk, splitMessage } from '../../zmp/index.ts'
import { FakeLegacyWallet } from './fakeWallet.ts'
import { describeFromNow } from './format.ts'
import { findSealedLetters, openLetter, sweepGift } from './inbox.ts'
import { bundleToMemos, previewFee, retryDelivery, sealAndSend } from './seal.ts'
import { MAX_LEAD_MS, MIN_GIFT_ZAT, MIN_LEAD_MS, validateSeal } from './validate.ts'
import type { SealInput } from './types.ts'

const R1 = FIXTURE_ROUNDS[0] ?? 0
const R2 = FIXTURE_ROUNDS[1] ?? 0
/** A time whose drand round is already published, so a recorded beacon can open it. */
const UNLOCK_MS = timeOfRound(R1)
const SEALED_AT = UNLOCK_MS - 30_000
const AFTER = UNLOCK_MS + 5_000
const RECIPIENT = 'utest1recipientaddressrecipientaddress'

const input = (overrides: Partial<SealInput> = {}): SealInput => ({
  recipient: RECIPIENT,
  letter: 'My dearest Ada,\nSee you on the other side.',
  amountZat: 50_000_000n,
  unlockMs: UNLOCK_MS,
  ...overrides,
})

const seal = (wallet: FakeLegacyWallet | null, overrides: Partial<SealInput> = {}) =>
  sealAndSend(wallet, input(overrides), { nowMs: SEALED_AT, client: fixtureClient() })

describe('validateSeal', () => {
  const now = 1_000_000

  it('accepts a good letter, with or without a gift, and trims text', () => {
    const base = {
      recipient: ` ${RECIPIENT} `,
      letter: '  hi  ',
      amountZat: null,
      unlockMs: now + 60_000,
    }
    expect(validateSeal(base, now)).toEqual({
      ok: true,
      value: { recipient: RECIPIENT, letter: 'hi', amountZat: null, unlockMs: now + 60_000 },
    })
    expect(validateSeal({ ...base, amountZat: MIN_GIFT_ZAT }, now).ok).toBe(true)
  })

  it('reports each problem on its own field', () => {
    const result = validateSeal(
      { recipient: 'nope!', letter: '  ', amountZat: 5n, unlockMs: Number.NaN },
      now,
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(['amount', 'letter', 'recipient', 'unlock'])
  })

  it('requires a recipient address of the right shape', () => {
    for (const recipient of ['', 'short', 'has spaces in it and is long enough', 'x'.repeat(501)]) {
      expect(validateSeal({ ...input({ unlockMs: now + 60_000 }), recipient }, now).ok).toBe(false)
    }
  })

  it('limits the letter by bytes, not characters', () => {
    const at = (letter: string) => validateSeal(input({ letter, unlockMs: now + 60_000 }), now).ok
    expect(at('a'.repeat(2048))).toBe(true)
    expect(at('a'.repeat(2049))).toBe(false)
    expect(at('é'.repeat(1024))).toBe(true)
    expect(at('é'.repeat(1025))).toBe(false)
  })

  it('needs an unlock time a little ahead, and not absurdly far', () => {
    const at = (unlockMs: number) => validateSeal(input({ unlockMs }), now).ok
    expect(at(now + MIN_LEAD_MS - 1)).toBe(false)
    expect(at(now + MIN_LEAD_MS)).toBe(true)
    expect(at(now + MAX_LEAD_MS)).toBe(true)
    expect(at(now + MAX_LEAD_MS + 1)).toBe(false)
    expect(at(now - 1000)).toBe(false)
  })
})

describe('sealAndSend (real crypto, recorded beacons, test-double wallet)', () => {
  it('seals a letter with a gift, funds the gift first, then delivers it as SEALED_BUNDLE memos', async () => {
    const wallet = new FakeLegacyWallet()
    const result = await seal(wallet)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(wallet.events).toEqual(['gift', 'fund', 'send'])
    expect(wallet.funded).toEqual([
      { address: expect.stringContaining('utestgiftaddress') as string, zat: 50_000_000n },
    ])
    expect(result.item).toMatchObject({
      recipient: RECIPIENT,
      unlockMs: UNLOCK_MS,
      amountZat: 50_000_000n,
      status: 'sent',
    })
    expect(result.item.memos).toBeUndefined()
    expect(result.item.giftSeed).toBeUndefined()

    expect(wallet.delivered.length).toBeGreaterThan(0)
    for (const memo of wallet.delivered) {
      expect(memo).toHaveLength(512)
      const decoded = decodeMemo(memo)
      expect(decoded.kind === 'chunk' && decoded.chunk.type).toBe('SEALED_BUNDLE')
    }
  })

  it('never puts the letter or the seed on the wire in the clear', async () => {
    const wallet = new FakeLegacyWallet()
    await seal(wallet)
    const everything = new TextDecoder('latin1').decode(
      Uint8Array.from(wallet.delivered.flatMap((m) => Array.from(m))),
    )
    expect(everything).not.toContain('dearest')
    expect(everything).not.toContain('seed words')
  })

  it('a letter with no gift creates and funds no gift wallet', async () => {
    const wallet = new FakeLegacyWallet()
    const result = await seal(wallet, { amountZat: null })
    expect(result.ok).toBe(true)
    expect(wallet.events).toEqual(['send'])
  })

  it('a 2 KB letter still fits in a few memos', async () => {
    const wallet = new FakeLegacyWallet()
    await seal(wallet, { letter: 'x'.repeat(2048) })
    expect(wallet.delivered.length).toBeLessThanOrEqual(8)
  })

  it('does not touch the wallet when the input is invalid, and says so when there is no wallet', async () => {
    const wallet = new FakeLegacyWallet()
    expect(await seal(wallet, { letter: '' })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(wallet.events).toEqual([])
    expect(await seal(null)).toEqual({ ok: false, reason: 'wallet-unavailable' })
  })

  it('sends nothing if the gift wallet cannot be created or the letter cannot be sealed', async () => {
    const noGift = new FakeLegacyWallet()
    noGift.failNext = 'gift'
    expect(await seal(noGift)).toEqual({ ok: false, reason: 'seal-failed' })
    expect(noGift.events).toEqual([])

    const offline = new FakeLegacyWallet()
    const broken = fixtureClient()
    broken.chain = () => ({ baseUrl: 'x', info: () => Promise.reject(new Error('offline')) })
    const result = await sealAndSend(offline, input(), { nowMs: SEALED_AT, client: broken })
    expect(result).toEqual({ ok: false, reason: 'seal-failed' })
    expect(offline.delivered).toHaveLength(0)
    expect(offline.funded).toHaveLength(0)
  })

  it('sends nothing if funding fails', async () => {
    const wallet = new FakeLegacyWallet()
    wallet.failNext = 'fund'
    expect(await seal(wallet)).toEqual({ ok: false, reason: 'funding-failed' })
    expect(wallet.delivered).toHaveLength(0)
  })

  it('keeps what is needed to retry and recover if delivery fails after funding', async () => {
    const wallet = new FakeLegacyWallet()
    wallet.failNext = 'send'
    const result = await seal(wallet)
    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'delivery-failed')
      throw new Error('expected a delivery failure')
    expect(result.item.status).toBe('failed')
    expect(result.item.giftSeed).toMatch(/^seed words/)
    expect(result.item.memos?.length).toBeGreaterThan(0)
    expect(wallet.funded).toHaveLength(1)

    const retried = await retryDelivery(wallet, result.item)
    expect(retried?.status).toBe('sent')
    expect(retried?.memos).toBeUndefined()
    expect(retried?.giftSeed).toBeUndefined()
    expect(wallet.delivered.length).toBeGreaterThan(0)
  })

  it('a retry that fails again returns null and a sent item cannot be retried', async () => {
    const wallet = new FakeLegacyWallet()
    wallet.failNext = 'send'
    const result = await seal(wallet)
    if (result.ok || result.reason !== 'delivery-failed')
      throw new Error('expected a delivery failure')
    wallet.sendMemos = () => Promise.reject(new Error('boom'))
    expect(await retryDelivery(wallet, result.item)).toBeNull()
    const sent = await seal(new FakeLegacyWallet())
    if (!sent.ok) throw new Error('expected success')
    expect(await retryDelivery(wallet, sent.item)).toBeNull()
  })

  it('previews the fee before anything is sent', async () => {
    const wallet = new FakeLegacyWallet()
    wallet.fee = 40_000n
    expect(await previewFee(wallet, input(), 100)).toBe(40_000n)
    expect(wallet.events).toEqual([])
  })

  it('splits a bundle into memos that reassemble to it', () => {
    const bundle = Uint8Array.from({ length: 1500 }, (_, i) => i % 251)
    const memos = bundleToMemos(bundle)
    expect(memos.length).toBe(4)
    expect(memos.every((m) => m.length === 512)).toBe(true)
  })
})

describe('the recipient: inbox, opening, sweeping', () => {
  async function delivered(overrides: Partial<SealInput> = {}) {
    const wallet = new FakeLegacyWallet()
    const result = await seal(wallet, overrides)
    if (!result.ok) throw new Error('expected success')
    return { wallet, item: result.item }
  }

  it('finds the sealed letter among received memos, once, ignoring everything else', async () => {
    const { wallet } = await delivered()
    const junk = [
      new TextEncoder().encode('thanks for dinner'),
      encodeChunk(splitMessage('NUDGE', new Uint8Array(3))[0]!),
      encodeChunk(splitMessage('SEALED_BUNDLE', new Uint8Array(20))[0]!),
    ]
    const memos = [...junk, ...wallet.delivered, ...wallet.delivered]
    const found = await findSealedLetters(memos, 7)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ unlockMs: UNLOCK_MS, receivedAtMs: 7 })
    expect(decodeBundle(found[0]?.bundle ?? new Uint8Array())?.mode).toBe('timelock')
  })

  it('ignores guardian-mode bundles (a different feature)', async () => {
    const sealed = await sealForGuardians({
      content: { letter: 'x' },
      heirAddress: RECIPIENT,
      total: 3,
      threshold: 2,
      periodMs: 1,
      graceMs: 1,
      nowMs: 1,
    })
    expect(await findSealedLetters(bundleToMemos(sealed.bundle), 1)).toEqual([])
  })

  it('will not open before the unlock time, even though the network could answer', async () => {
    const { wallet } = await delivered()
    const [item] = await findSealedLetters(wallet.delivered, SEALED_AT)
    if (item === undefined) throw new Error('expected a letter')
    expect(await openLetter(item, { client: fixtureClient(), nowMs: UNLOCK_MS - 1000 })).toEqual({
      ok: false,
      reason: 'not-yet',
    })
  })

  it('opens at the unlock time and returns the letter and the gift seed', async () => {
    const { wallet } = await delivered()
    const [item] = await findSealedLetters(wallet.delivered, SEALED_AT)
    if (item === undefined) throw new Error('expected a letter')
    const opened = await openLetter(item, { client: fixtureClient(), nowMs: AFTER })
    expect(opened).toEqual({
      ok: true,
      content: { letter: 'My dearest Ada,\nSee you on the other side.', giftSeed: 'seed words 1' },
    })
  })

  it('a letter without a gift opens with no seed', async () => {
    const { wallet } = await delivered({ amountZat: null })
    const [item] = await findSealedLetters(wallet.delivered, SEALED_AT)
    const opened = await openLetter(item!, {
      client: fixtureClient(),
      nowMs: AFTER,
    })
    expect(opened.ok && opened.content.giftSeed).toBeUndefined()
  })

  it('says the key is unavailable when the network cannot give it, and damaged for a bad letter', async () => {
    const { wallet } = await delivered()
    const [item] = await findSealedLetters(wallet.delivered, SEALED_AT)
    if (item === undefined) throw new Error('expected a letter')
    const empty = fixtureClient()
    empty.get = () => Promise.reject(new Error('offline'))
    expect(await openLetter(item, { client: empty, nowMs: AFTER })).toEqual({
      ok: false,
      reason: 'unavailable',
    })

    const damaged = item.bundle.slice()
    damaged[40] = (damaged[40] ?? 0) ^ 0xff
    expect(
      await openLetter({ ...item, bundle: damaged }, { client: fixtureClient(), nowMs: AFTER }),
    ).toEqual({ ok: false, reason: 'damaged' })
  })

  it('a different drand round cannot open the letter', async () => {
    const wallet = new FakeLegacyWallet()
    const later = timeOfRound(R2)
    const result = await sealAndSend(wallet, input({ unlockMs: later }), {
      nowMs: later - 30_000,
      client: fixtureClient(),
    })
    if (!result.ok) throw new Error('expected success')
    const [item] = await findSealedLetters(wallet.delivered, 1)
    const forged = fixtureClient({ swap: { [R2]: R1 } })
    expect(await openLetter(item!, { client: forged, nowMs: later + 5000 })).toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('sweeps the gift into the recipient wallet, once', async () => {
    const { wallet } = await delivered()
    const [item] = await findSealedLetters(wallet.delivered, SEALED_AT)
    const opened = await openLetter(item!, {
      client: fixtureClient(),
      nowMs: AFTER,
    })
    if (!opened.ok || opened.content.giftSeed === undefined) throw new Error('expected a seed')
    expect(await sweepGift(wallet, opened.content.giftSeed)).toEqual({
      ok: true,
      sweptZat: 50_000_000n - wallet.fee,
      txid: 'sweep-1',
    })
    expect(await sweepGift(wallet, opened.content.giftSeed)).toEqual({
      ok: false,
      reason: 'nothing-to-sweep',
    })
  })

  it('reports a wallet error during sweeping as a failure without details', async () => {
    const wallet = new FakeLegacyWallet()
    wallet.failNext = 'sweep'
    expect(await sweepGift(wallet, 'seed')).toEqual({ ok: false, reason: 'failed' })
  })

  it('demo mode: a letter and funds sealed 30 seconds ahead open on the recipient side and are swept', async () => {
    const wallet = new FakeLegacyWallet()
    const sealedAt = UNLOCK_MS - 30_000
    const result = await sealAndSend(wallet, input(), { nowMs: sealedAt, client: fixtureClient() })
    if (!result.ok) throw new Error('expected success')
    const [item] = await findSealedLetters(await wallet.receivedMemos(), sealedAt)
    if (item === undefined) throw new Error('expected a letter')
    expect(await openLetter(item, { client: fixtureClient(), nowMs: sealedAt + 10_000 })).toEqual({
      ok: false,
      reason: 'not-yet',
    })
    const opened = await openLetter(item, { client: fixtureClient(), nowMs: sealedAt + 31_000 })
    expect(opened.ok).toBe(true)
    const seed = opened.ok ? opened.content.giftSeed : undefined
    expect(seed).toBeDefined()
    expect((await sweepGift(wallet, seed ?? '')).ok).toBe(true)
  })
})

describe('describeFromNow', () => {
  const NOW = Date.UTC(2026, 9, 27)
  const DAY_MS = 24 * 60 * 60 * 1000
  it('says how far ahead a time is, in the unit a person would check', () => {
    expect(describeFromNow(NOW + 30_000, NOW)).toBe('in about 1 minute')
    expect(describeFromNow(NOW + 5 * 60_000, NOW)).toBe('in about 5 minutes')
    expect(describeFromNow(NOW + 3 * 60 * 60_000, NOW)).toBe('in about 3 hours')
    expect(describeFromNow(NOW + 3 * DAY_MS, NOW)).toBe('in about 3 days')
    expect(describeFromNow(NOW + 365 * DAY_MS, NOW)).toBe('in about 12 months')
    expect(describeFromNow(NOW + 5 * 365 * DAY_MS, NOW)).toBe('in about 5 years')
  })
  it('says nothing for a time that has passed or is not a time', () => {
    expect(describeFromNow(NOW - 1, NOW)).toBe('')
    expect(describeFromNow(Number.NaN, NOW)).toBe('')
  })
})
