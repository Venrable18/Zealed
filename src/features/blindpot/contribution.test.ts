import { describe, expect, it } from 'vitest'
import { POT_DENOMINATIONS_ZAT, POT_MAX_PIECES } from '../../config/constants.ts'
import { decodeMemo } from '../../zmp/index.ts'
import { FakeContributorWallet } from './fakeWallet.ts'
import {
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  createContribution,
  nextDue,
  progress,
  receipt,
  resume,
  runStep,
  type Contribution,
} from './queue.ts'
import { maxGiftZat, splitContribution, type SplitResult } from './splitter.ts'
import { encodeWishMemo } from './wishMemo.ts'
import { decodeWish } from './wishes.ts'

const UNIT = 100_000n
const ADDRESS = 'utest1fakeaddressfakeaddressfakeaddress'
const pot = { id: 'a'.repeat(32), address: ADDRESS }

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ok(result: SplitResult): Extract<SplitResult, { ok: true }> {
  if (!result.ok) throw new Error('expected a split')
  return result
}

/** Independent greedy piece count, used to check the splitter without reusing its code. */
function countPieces(units: number): number {
  const denominations = POT_DENOMINATIONS_ZAT.map((d) => Number(d / UNIT)).reverse()
  let remaining = units
  let count = 0
  for (const d of denominations) {
    count += Math.floor(remaining / d)
    remaining %= d
  }
  return count
}

describe('splitContribution', () => {
  const zec = (text: string) => BigInt(Math.round(Number(text) * 1e8))

  it('uses a single piece when the amount is a standard size', () => {
    const split = ok(splitContribution(zec('0.5'), false))
    expect(split.pieces.map((p) => p.zat)).toEqual([zec('0.5')])
    expect(split.adjusted).toBe(false)
  })

  it('splits greedily into the largest standard pieces', () => {
    const split = ok(splitContribution(zec('7.77'), false))
    expect(split.pieces.map((p) => p.zat)).toEqual(
      [5, 2, 0.5, 0.2, 0.05, 0.02].map((v) => zec(String(v))),
    )
    expect(split.totalZat).toBe(zec('7.77'))
  })

  it('rounds to the nearest amount that fits in six pieces and says so', () => {
    const split = ok(splitContribution(zec('0.999'), false))
    expect(split.adjusted).toBe(true)
    expect(split.totalZat).not.toBe(zec('0.999'))
    expect(split.pieces.length).toBeLessThanOrEqual(POT_MAX_PIECES)
  })

  it('rejects amounts below the smallest piece', () => {
    expect(splitContribution(UNIT - 1n, false)).toEqual({ ok: false, reason: 'too-small' })
    expect(splitContribution(0n, true)).toEqual({ ok: false, reason: 'too-small' })
    expect(ok(splitContribution(UNIT, false)).totalZat).toBe(UNIT)
  })

  it('caps very large gifts and reports it', () => {
    const split = ok(splitContribution(zec('1000'), false))
    expect(split.capped).toBe(true)
    expect(split.totalZat).toBe(maxGiftZat(false))
    expect(split.totalZat).toBe(zec('60'))
    expect(split.pieces).toHaveLength(6)
  })

  it('puts the wish on a 0.001 piece, and only one piece', () => {
    for (const text of ['0.001', '0.002', '0.011', '0.05', '0.5', '3.333', '12.34']) {
      const split = ok(splitContribution(zec(text), true))
      const carriers = split.pieces.filter((p) => p.carriesWish)
      expect(carriers).toHaveLength(1)
      expect(carriers[0]?.zat).toBe(UNIT)
      expect(split.pieces.length).toBeLessThanOrEqual(POT_MAX_PIECES)
    }
  })

  it('makes room for the wish by rounding up by 0.001 where needed', () => {
    const split = ok(splitContribution(zec('0.5'), true))
    expect(split.totalZat).toBe(zec('0.501'))
    expect(split.adjusted).toBe(true)
    expect(ok(splitContribution(zec('0.05'), true)).totalZat).toBe(zec('0.05'))
    expect(ok(splitContribution(UNIT, true)).pieces).toEqual([{ zat: UNIT, carriesWish: true }])
  })

  it('always sums exactly and uses only standard pieces (seeded property test)', () => {
    const random = mulberry32(11)
    const standard = new Set(POT_DENOMINATIONS_ZAT)
    for (let i = 0; i < 3000; i++) {
      const requested = BigInt(Math.floor(random() * 6_500_000_000)) + UNIT
      const withWish = random() < 0.5
      const split = ok(splitContribution(requested, withWish))
      expect(split.pieces.every((p) => standard.has(p.zat))).toBe(true)
      expect(split.pieces.reduce((sum, p) => sum + p.zat, 0n)).toBe(split.totalZat)
      expect(split.pieces.length).toBeLessThanOrEqual(POT_MAX_PIECES)
      expect(split.totalZat <= maxGiftZat(withWish)).toBe(true)
      expect(split.adjusted).toBe(split.totalZat !== requested)
      expect(split.pieces.filter((p) => p.carriesWish).length).toBe(withWish ? 1 : 0)
    }
  })

  it('picks the nearest possible total, never rounding up when a tie allows rounding down', () => {
    // Brute force: every total reachable with the allowed pieces, in 0.001 steps up to 60 ZEC.
    const reachable = (maxPieces: number, allowZero: boolean) => {
      const set: number[] = []
      for (let u = allowZero ? 0 : 1; u <= 60_000; u++)
        if (u === 0 || countPieces(u) <= maxPieces) set.push(u)
      return set
    }
    const plain = reachable(POT_MAX_PIECES, false)
    const withRoom = reachable(POT_MAX_PIECES - 1, true).map((u) => u + 1)
    const random = mulberry32(5)
    for (let i = 0; i < 400; i++) {
      const units = 1 + Math.floor(random() * 59_000)
      const wobble = BigInt(Math.floor(random() * 100_000))
      const requested = BigInt(units) * UNIT + wobble
      for (const [withWish, candidates] of [
        [false, plain],
        [true, withRoom],
      ] as const) {
        const target = Number(requested)
        let best = candidates[0] ?? 0
        for (const c of candidates) {
          const d = Math.abs(c * Number(UNIT) - target)
          const bd = Math.abs(best * Number(UNIT) - target)
          if (d < bd || (d === bd && c < best)) best = c
        }
        const split = ok(splitContribution(requested, withWish))
        expect(split.totalZat).toBe(BigInt(best) * UNIT)
      }
    }
  })
})

describe('encodeWishMemo', () => {
  it('makes one 512-byte ZMP memo the host will accept', () => {
    const result = encodeWishMemo('  Happy wedding! 🎉  ')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.memo).toHaveLength(512)
    const decoded = decodeMemo(result.memo)
    expect(decoded.kind === 'chunk' && decoded.chunk.type).toBe('WISH')
    expect(decoded.kind === 'chunk' && decodeWish(decoded.chunk.payload)).toBe('Happy wedding! 🎉')
  })

  it('refuses what the host would drop', () => {
    expect(encodeWishMemo('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(encodeWishMemo('a'.repeat(141))).toEqual({ ok: false, reason: 'too-many-characters' })
    expect(encodeWishMemo('x\u0007y')).toEqual({ ok: false, reason: 'invalid' })
    expect(encodeWishMemo('abc‮def')).toEqual({ ok: false, reason: 'invalid' })
    // 140 family emoji is within the character limit but far too many bytes for one memo.
    expect(encodeWishMemo('👨‍👩‍👧‍👦'.repeat(140))).toEqual({ ok: false, reason: 'too-many-bytes' })
  })
})

describe('contribution queue (with a test-double wallet)', () => {
  const NOW = 1_000_000
  const delays = { min: 1000, max: 5000 }

  function build(amount: bigint, wish?: string, random = mulberry32(3)): Contribution {
    const split = ok(splitContribution(amount, wish !== undefined))
    return createContribution({ pot, split, wish, nowMs: NOW, delays, random })
  }

  async function runAll(start: Contribution, wallet: FakeContributorWallet): Promise<Contribution> {
    let current = start
    let now = NOW
    for (let i = 0; i < 200 && progress(current).state === 'running'; i++) {
      current = await runStep(current, wallet, now)
      now += 1000
    }
    return current
  }

  it('lets the first piece go at once and spaces the rest by a random extra delay', () => {
    const c = build(777_000_000n)
    expect(c.pieces[0]?.notBeforeMs).toBe(NOW)
    for (let i = 1; i < c.pieces.length; i++) {
      const gap = (c.pieces[i]?.notBeforeMs ?? 0) - (c.pieces[i - 1]?.notBeforeMs ?? 0)
      expect(gap).toBeGreaterThanOrEqual(delays.min)
      expect(gap).toBeLessThanOrEqual(delays.max)
    }
  })

  it('does not always send the wish piece first or last', () => {
    const positions = new Set<number>()
    for (let seed = 1; seed < 60; seed++) {
      const c = build(5_000_000n, 'hi', mulberry32(seed))
      positions.add(c.pieces.findIndex((p) => p.wish !== undefined))
    }
    expect(positions.size).toBeGreaterThan(2)
  })

  it('sends every piece as its own transaction, the wish only on the 0.001 piece', async () => {
    const wallet = new FakeContributorWallet()
    const done = await runAll(build(5_000_000n, 'Many happy years'), wallet)

    expect(progress(done)).toEqual({ sent: 6, total: 6, state: 'done' })
    expect(wallet.sent).toHaveLength(6)
    expect(wallet.sent.every((s) => s.address === ADDRESS)).toBe(true)
    expect(wallet.sent.reduce((sum, s) => sum + s.zat, 0n)).toBe(5_000_000n)

    const withMemo = wallet.sent.filter((s) => s.memo !== undefined)
    expect(withMemo).toHaveLength(1)
    expect(withMemo[0]?.zat).toBe(UNIT)
    const decoded = decodeMemo(withMemo[0]?.memo ?? new Uint8Array())
    expect(decoded.kind === 'chunk' && decodeWish(decoded.chunk.payload)).toBe('Many happy years')
  })

  it('sends nothing before its time and never two at once', async () => {
    const wallet = new FakeContributorWallet()
    const c = build(77_000_000n, undefined)
    expect(nextDue(c, NOW - 1)).toBe(-1)
    expect(nextDue(c, NOW)).toBe(0)
    const sending: Contribution = {
      ...c,
      pieces: c.pieces.map((p, i) => (i === 0 ? { ...p, status: 'sending' } : p)),
    }
    expect(nextDue(sending, NOW + 1_000_000)).toBe(-1)
    expect(await runStep(c, wallet, NOW - 1)).toBe(c)
    expect(wallet.sent).toHaveLength(0)
  })

  it('shows the guest only their own receipt', async () => {
    const wallet = new FakeContributorWallet()
    const done = await runAll(build(5_000_000n, 'Congrats'), wallet)
    expect(receipt(done)).toEqual({ pieces: 6, totalZat: 5_000_000n, wish: 'Congrats' })
    expect(Object.keys(receipt(done)).sort()).toEqual(['pieces', 'totalZat', 'wish'])
  })

  it('waits and retries when change is not spendable yet, without counting a failure', async () => {
    const wallet = new FakeContributorWallet()
    wallet.script = [
      { ok: false, reason: 'not-spendable-yet' },
      { ok: false, reason: 'not-spendable-yet' },
      { ok: false, reason: 'not-spendable-yet' },
      { ok: false, reason: 'not-spendable-yet' },
    ]
    let c = build(200_000_000n, undefined)
    for (let i = 0; i < 4; i++) c = await runStep(c, wallet, NOW + i * (RETRY_DELAY_MS + 10_000))
    const first = c.pieces[0]
    expect(first?.status).toBe('pending')
    expect(first?.attempts).toBe(0)
    expect(first?.notBeforeMs).toBeGreaterThan(NOW)
  })

  it('gives up on a piece after repeated failures, then continues when asked', async () => {
    const wallet = new FakeContributorWallet()
    wallet.script = Array.from({ length: MAX_ATTEMPTS }, () => ({
      ok: false as const,
      reason: 'failed' as const,
    }))
    let c = build(200_000_000n, undefined)
    let now = NOW
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      c = await runStep(c, wallet, now)
      now += RETRY_DELAY_MS + 1
    }
    expect(progress(c).state).toBe('failed')
    expect(nextDue(c, now)).toBe(-1)
    c = resume(c, now)
    expect(progress(c).state).toBe('running')
    expect(progress(await runAll(c, wallet)).state).toBe('done')
  })

  it('treats a thrown error as a failure, and pauses when funds run out', async () => {
    const throwing = new FakeContributorWallet()
    throwing.sendPiece = () => Promise.reject(new Error('boom'))
    const c1 = await runStep(build(200_000_000n, undefined), throwing, NOW)
    expect(c1.pieces[0]).toMatchObject({ status: 'pending', attempts: 1 })

    const broke = new FakeContributorWallet()
    broke.script = [{ ok: false, reason: 'insufficient-funds' }]
    const c2 = await runStep(build(200_000_000n, undefined), broke, NOW)
    expect(progress(c2).state).toBe('blocked')
    expect(progress(await runAll(resume(c2, NOW), broke)).state).toBe('done')
  })

  it('keeps pieces already sent when a later one fails', async () => {
    const wallet = new FakeContributorWallet()
    let c = build(777_000_000n, undefined)
    c = await runStep(c, wallet, NOW)
    expect(c.pieces[0]?.status).toBe('sent')
    wallet.script = [{ ok: false, reason: 'insufficient-funds' }]
    c = await runStep(c, wallet, NOW + 10 * 60_000)
    expect(progress(c)).toMatchObject({ sent: 1, state: 'blocked' })
  })
})
