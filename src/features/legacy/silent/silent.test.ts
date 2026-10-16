import { describe, expect, it } from 'vitest'
import { sealForGuardians } from '../../../crypto/bundle.ts'
import { generateKeypair, signCheckIn, signRevoke } from '../../../crypto/sign.ts'
import { FakeLegacyWallet, FakeNetwork } from '../fakeWallet.ts'
import { sweepGift } from '../inbox.ts'
import { checkIncoming } from './incoming.ts'
import {
  guardStatus,
  ingestForGuardian,
  markReleased,
  nudgeAction,
  releaseAction,
  dueMs,
  releaseMs,
  type GuardianRecord,
} from './guardian.ts'
import { ingestForHeir, openGuarded, shareCount } from './heir.ts'
import {
  decodeRelease,
  decodeShareMessage,
  encodeNudge,
  encodeRelease,
  encodeShareMessage,
  toMemos,
} from './messages.ts'
import {
  ingestForOwner,
  ownerCheckIn,
  ownerRevoke,
  runPending,
  setupSilentLetter,
  validateSilent,
  type SilentInput,
} from './owner.ts'

const T0 = 1_800_000_000_000
const P = 120_000
const G = 60_000
const letter = 'To my family: the documents are in the blue folder.'

const addr = (name: string) => `utest1${name.padEnd(30, 'x')}`
const [OWNER, G1, G2, G3, HEIR] = [
  'owner',
  'guardianone',
  'guardiantwo',
  'guardianthree',
  'heir',
].map(addr) as [string, string, string, string, string]

function actors() {
  const network = new FakeNetwork()
  const wallet = (address: string) => new FakeLegacyWallet({ address, network })
  return {
    network,
    owner: wallet(OWNER),
    g1: wallet(G1),
    g2: wallet(G2),
    g3: wallet(G3),
    heir: wallet(HEIR),
  }
}

const input = (overrides: Partial<SilentInput> = {}): SilentInput => ({
  heirAddress: HEIR,
  guardianAddresses: [G1, G2, G3],
  threshold: 2,
  periodMs: P,
  graceMs: G,
  letter,
  amountZat: 100_000_000n,
  ...overrides,
})

async function setup(overrides: Partial<SilentInput> = {}) {
  const a = actors()
  const result = await setupSilentLetter(a.owner, input(overrides), { nowMs: T0 })
  if (!result.ok) throw new Error(`setup failed: ${result.reason}`)
  return { ...a, record: result.record }
}

/** Each guardian reads their wallet and gets their record. */
async function guardianRecord(
  wallet: FakeLegacyWallet,
  now: number,
  existing: GuardianRecord[] = [],
) {
  const { records } = await ingestForGuardian(existing, await wallet.receivedMemos(), now)
  return records
}

describe('validateSilent', () => {
  it('accepts a good setup', () => {
    expect(validateSilent(input()).ok).toBe(true)
    expect(
      validateSilent(input({ amountZat: null, guardianAddresses: [G1, G2], threshold: 2 })).ok,
    ).toBe(true)
  })

  it('checks every field', () => {
    const bad = validateSilent({
      heirAddress: '',
      guardianAddresses: ['x'],
      threshold: 5,
      periodMs: 1,
      graceMs: 1,
      letter: '',
      amountZat: 5n,
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok)
      expect(Object.keys(bad.errors).sort()).toEqual([
        'amount',
        'grace',
        'guardians',
        'heir',
        'letter',
        'period',
        'threshold',
      ])
  })

  it('needs 2 to 5 different guardians, none of them the heir, and a sensible threshold', () => {
    const errors = (o: Partial<SilentInput>) => {
      const r = validateSilent(input(o))
      return r.ok ? {} : r.errors
    }
    expect(errors({ guardianAddresses: [G1] }).guardians).toBeDefined()
    expect(errors({ guardianAddresses: [G1, G1] }).guardians).toContain('different')
    expect(errors({ guardianAddresses: [G1, HEIR] }).guardians).toContain(
      'heir cannot also be a guardian',
    )
    expect(
      errors({ guardianAddresses: Array.from({ length: 6 }, (_, i) => addr(`g${String(i)}`)) })
        .guardians,
    ).toBeDefined()
    expect(errors({ threshold: 1 }).threshold).toBeDefined()
    expect(errors({ threshold: 4 }).threshold).toBeDefined()
    expect(errors({ threshold: 3 }).threshold).toBeUndefined()
  })
})

describe('messages', () => {
  it('round-trips a share message and rejects any that does not agree with itself', async () => {
    const sealed = await sealForGuardians({
      content: { letter: 'x' },
      heirAddress: HEIR,
      total: 3,
      threshold: 2,
      periodMs: P,
      graceMs: G,
      nowMs: T0,
    })
    const bytes = encodeShareMessage({
      policy: sealed.policy,
      share: sealed.shares[0]!,
      ownerAddress: OWNER,
    })
    expect(decodeShareMessage(bytes)).toEqual({
      policy: sealed.policy,
      share: sealed.shares[0],
      ownerAddress: OWNER,
    })

    const wrongSet = await sealForGuardians({
      content: { letter: 'x' },
      heirAddress: HEIR,
      total: 5,
      threshold: 3,
      periodMs: P,
      graceMs: G,
      nowMs: T0,
    })
    const mismatch = encodeShareMessage({
      policy: sealed.policy,
      share: wrongSet.shares[0]!,
      ownerAddress: OWNER,
    })
    expect(decodeShareMessage(mismatch)).toBeNull()
    expect(
      decodeShareMessage(
        encodeShareMessage({
          policy: sealed.policy,
          share: sealed.shares[0]!,
          ownerAddress: 'bad address',
        }),
      ),
    ).toBeNull()
    expect(decodeShareMessage(bytes.slice(0, bytes.length - 1))).toBeNull()
    expect(decodeShareMessage(new Uint8Array(0))).toBeNull()
  })

  it('round-trips releases and nudges and rejects malformed ones', async () => {
    const sealed = await sealForGuardians({
      content: { letter: 'x' },
      heirAddress: HEIR,
      total: 3,
      threshold: 2,
      periodMs: P,
      graceMs: G,
      nowMs: T0,
    })
    const share = sealed.shares[1]!
    expect(decodeRelease(encodeRelease({ bundleId: sealed.bundleId, share }))).toEqual({
      bundleId: sealed.bundleId,
      share,
    })
    expect(decodeRelease(new Uint8Array(10))).toBeNull()
    expect(decodeRelease(new Uint8Array(40))).toBeNull()
    expect(encodeNudge(sealed.bundleId)).toEqual(sealed.bundleId)
  })

  it('never throws on random bytes (seeded fuzz)', () => {
    let a = 99
    const next = () => ((a = (a * 1664525 + 1013904223) | 0) >>> 0) / 4294967296
    for (let i = 0; i < 3000; i++) {
      const junk = Uint8Array.from({ length: Math.floor(next() * 400) }, () =>
        Math.floor(next() * 256),
      )
      expect(() => decodeShareMessage(junk)).not.toThrow()
      expect(() => decodeRelease(junk)).not.toThrow()
    }
  })
})

describe('owner setup', () => {
  it('sends the sealed letter to the heir, and a share, the policy and a first check-in to each guardian', async () => {
    const { network, owner, record } = await setup()
    expect(record).toMatchObject({
      counter: 1,
      lastCheckInMs: T0,
      threshold: 2,
      revoked: false,
      pending: [],
    })
    expect(record.giftSeed).toBeUndefined()
    expect(network.inboxes.get(HEIR)?.length).toBeGreaterThan(0)
    for (const g of [G1, G2, G3]) expect(network.inboxes.get(g)?.length).toBeGreaterThanOrEqual(2)
    expect(owner.events.slice(0, 2)).toEqual(['gift', 'fund'])
    expect(owner.events.filter((e) => e === 'send')).toHaveLength(4)
  })

  it('puts no readable letter or seed on the wire, and gives the heir no key material', async () => {
    const { network } = await setup()
    for (const memos of network.inboxes.values()) {
      const text = new TextDecoder('latin1').decode(
        Uint8Array.from(memos.flatMap((m) => Array.from(m))),
      )
      expect(text).not.toContain('blue folder')
      expect(text).not.toContain('seed words')
    }
  })

  it('a letter without funds creates no gift wallet', async () => {
    const { owner } = await setup({ amountZat: null })
    expect(owner.events).not.toContain('gift')
    expect(owner.events).not.toContain('fund')
  })

  it('does not touch the wallet for invalid input, and reports a missing wallet', async () => {
    const a = actors()
    expect(await setupSilentLetter(a.owner, input({ letter: '' }), { nowMs: T0 })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
    expect(a.owner.events).toEqual([])
    expect(await setupSilentLetter(null, input(), { nowMs: T0 })).toEqual({
      ok: false,
      reason: 'wallet-unavailable',
    })
  })

  it('sends nothing if sealing or funding fails', async () => {
    const a = actors()
    a.owner.failNext = 'gift'
    expect(await setupSilentLetter(a.owner, input(), { nowMs: T0 })).toEqual({
      ok: false,
      reason: 'seal-failed',
    })
    const b = actors()
    b.owner.failNext = 'fund'
    expect(await setupSilentLetter(b.owner, input(), { nowMs: T0 })).toEqual({
      ok: false,
      reason: 'funding-failed',
    })
    expect(b.network.inboxes.size).toBe(0)
  })

  it('keeps unsent items and the gift seed when delivery stops partway, and finishes on retry', async () => {
    const a = actors()
    let sends = 0
    const original = a.owner.sendMemos.bind(a.owner)
    a.owner.sendMemos = (args) =>
      ++sends === 3 ? Promise.reject(new Error('boom')) : original(args)
    const result = await setupSilentLetter(a.owner, input(), { nowMs: T0 })
    if (result.ok || result.reason !== 'delivery-failed')
      throw new Error('expected a partial delivery')
    expect(result.record.pending).toHaveLength(2)
    expect(result.record.giftSeed).toMatch(/^seed words/)

    const finished = await runPending(a.owner, result.record)
    expect(finished.ok).toBe(true)
    expect(finished.record.pending).toHaveLength(0)
    expect(finished.record.giftSeed).toBeUndefined()
    expect(a.network.inboxes.get(G3)?.length).toBeGreaterThan(0)
  })
})

describe('guardians', () => {
  it('each guardian gets a record that starts OK, then goes overdue, then releasing', async () => {
    const { g1 } = await setup()
    const [record] = await guardianRecord(g1, T0 + 1000)
    if (record === undefined) throw new Error('expected a record')
    expect(record).toMatchObject({
      ownerAddress: OWNER,
      lastCounter: 1,
      lastCheckInMs: T0,
      released: false,
      revoked: false,
    })
    expect(dueMs(record)).toBe(T0 + P)
    expect(releaseMs(record)).toBe(T0 + P + G)
    expect(guardStatus(record, T0 + P - 1)).toBe('ok')
    expect(guardStatus(record, T0 + P)).toBe('overdue')
    expect(guardStatus(record, T0 + P + G - 1)).toBe('overdue')
    expect(guardStatus(record, T0 + P + G)).toBe('releasing')
  })

  it('a check-in moves the deadline, and is read the same whatever order memos arrive in', async () => {
    const { owner, g1, record } = await setup()
    const checked = await ownerCheckIn(owner, record, T0 + 90_000)
    expect(checked.ok).toBe(true)
    const memos = await g1.receivedMemos()
    const { records } = await ingestForGuardian([], [...memos].reverse(), T0 + 100_000)
    expect(records[0]).toMatchObject({ lastCounter: 2, lastCheckInMs: T0 + 90_000 })
    expect(dueMs(records[0]!)).toBe(T0 + 90_000 + P)
  })

  it('refuses a forged check-in (signed with someone else’s key)', async () => {
    const { g1, record } = await setup()
    const [guard] = await guardianRecord(g1, T0 + 1000)
    const forged = signCheckIn(generateKeypair().privateKey, {
      bundleId: guard?.policy.bundleId ?? new Uint8Array(16),
      counter: 99,
      timestampMs: T0 + 2000,
    })
    const result = await ingestForGuardian(
      guard === undefined ? [] : [guard],
      toMemos('CHECKIN', forged),
      T0 + 3000,
    )
    expect(result.events).toEqual([
      { kind: 'rejected-check-in', bundleIdHex: record.bundleIdHex, reason: 'invalid-signature' },
    ])
    expect(result.records[0]).toMatchObject({ lastCounter: 1, lastCheckInMs: T0 })
  })

  it('refuses a replayed check-in, an old counter, and one dated in the future', async () => {
    const { owner, g1, record } = await setup()
    await ownerCheckIn(owner, record, T0 + 30_000)
    const [first] = await guardianRecord(g1, T0 + 40_000)
    if (first === undefined) throw new Error('expected a record')
    const checkIn2 = (await g1.receivedMemos()).slice(-1)
    // Feeding the same memos again: every check-in is now old or repeated.
    const again = await ingestForGuardian([first], await g1.receivedMemos(), T0 + 50_000)
    expect(again.events.filter((e) => e.kind === 'check-in')).toHaveLength(0)
    expect(again.records[0]).toMatchObject({ lastCounter: 2, lastCheckInMs: T0 + 30_000 })
    expect(checkIn2.length).toBe(1)

    const owned = (await import('../../../crypto/sign.ts')).signCheckIn
    const future = owned(record.privateKey, {
      bundleId: first.policy.bundleId,
      counter: 9,
      timestampMs: T0 + 50_000 + 11 * 60_000,
    })
    const result = await ingestForGuardian([first], toMemos('CHECKIN', future), T0 + 50_000)
    expect(result.events[0]).toMatchObject({ kind: 'rejected-check-in', reason: 'from-the-future' })
  })

  it('refuses a check-in for a letter it does not guard', async () => {
    const { g1, record } = await setup()
    const [guard] = await guardianRecord(g1, T0 + 1000)
    const stray = signCheckIn(record.privateKey, {
      bundleId: new Uint8Array(16).fill(5),
      counter: 4,
      timestampMs: T0 + 2000,
    })
    const result = await ingestForGuardian(
      guard === undefined ? [] : [guard],
      toMemos('CHECKIN', stray),
      T0 + 3000,
    )
    expect(result.events[0]).toMatchObject({ kind: 'rejected-check-in', reason: 'unknown-bundle' })
  })

  it('may remind the owner only while overdue, and release only after the grace period', async () => {
    const { g1 } = await setup()
    const [record] = await guardianRecord(g1, T0 + 1000)
    if (record === undefined) throw new Error('expected a record')
    expect(nudgeAction(record, T0 + P - 1)).toBeNull()
    expect(releaseAction(record, T0 + P + 1000)).toBeNull()
    expect(nudgeAction(record, T0 + P + 1000)?.to).toBe(OWNER)
    expect(releaseAction(record, T0 + P + G)?.to).toBe(HEIR)
  })

  it('wipes the share after release, and then cannot release again', async () => {
    const { g1 } = await setup()
    const [record] = await guardianRecord(g1, T0 + 1000)
    if (record === undefined) throw new Error('expected a record')
    const done = markReleased(record)
    expect(done.share).toBeUndefined()
    expect(guardStatus(done, T0 + P + G + 1)).toBe('released')
    expect(releaseAction(done, T0 + P + G + 1)).toBeNull()
    expect(nudgeAction(done, T0 + P + 1)).toBeNull()
  })
})

describe('revoke', () => {
  it('guardians discard their shares and can no longer release, and a forged revoke is ignored', async () => {
    const { owner, g1, g2, record } = await setup()
    const [forgedTarget] = await guardianRecord(g1, T0 + 1000)
    if (forgedTarget === undefined) throw new Error('expected a record')
    const forged = signRevoke(generateKeypair().privateKey, {
      bundleId: forgedTarget.policy.bundleId,
      timestampMs: T0 + 2000,
    })
    const ignored = await ingestForGuardian([forgedTarget], toMemos('REVOKE', forged), T0 + 3000)
    expect(ignored.records[0]?.revoked).toBe(false)
    expect(ignored.records[0]?.share).toBeDefined()

    const revoked = await ownerRevoke(owner, record, T0 + 5000)
    expect(revoked.ok).toBe(true)
    expect(revoked.record.revoked).toBe(true)
    for (const wallet of [g1, g2]) {
      const [guard] = await guardianRecord(wallet, T0 + 6000)
      expect(guard).toMatchObject({ revoked: true, share: undefined })
      expect(guardStatus(guard!, T0 + P + G + 1)).toBe('revoked')
      expect(releaseAction(guard!, T0 + P + G + 1)).toBeNull()
    }
    expect((await ownerCheckIn(owner, revoked.record, T0 + 7000)).ok).toBe(false)
  })

  it('a late check-in does not undo a revoke', async () => {
    const { owner, g1, record } = await setup()
    const revoked = await ownerRevoke(owner, record, T0 + 5000)
    const stale = await ownerCheckIn(owner, { ...revoked.record, revoked: false }, T0 + 6000)
    expect(stale.ok).toBe(true)
    const [guard] = await guardianRecord(g1, T0 + 7000)
    expect(guard?.revoked).toBe(true)
  })
})

describe('owner reminders', () => {
  it('counts each reminder once, however often the inbox is rescanned', async () => {
    const { owner, g1, record } = await setup()
    const [guard] = await guardianRecord(g1, T0 + P + 1000)
    const action = nudgeAction(guard!, T0 + P + 1000)
    if (action === null) throw new Error('expected a reminder')
    await g1.sendMemos(action)
    const once = await ingestForOwner([record], await owner.receivedMemos())
    expect(once[0]?.nudgeIds).toHaveLength(1)
    const twice = await ingestForOwner(once, await owner.receivedMemos())
    expect(twice[0]?.nudgeIds).toHaveLength(1)
    // Sending the very same memos again is the same message, not a new reminder.
    await g1.sendMemos(action)
    expect((await ingestForOwner(twice, await owner.receivedMemos()))[0]?.nudgeIds).toHaveLength(1)
    // A second reminder is built fresh, with its own ID.
    const second = nudgeAction(guard!, T0 + P + 2000)
    if (second === null) throw new Error('expected a reminder')
    await g1.sendMemos(second)
    expect((await ingestForOwner(twice, await owner.receivedMemos()))[0]?.nudgeIds).toHaveLength(2)
  })
})

describe('the heir', () => {
  async function released(guardians: ('g1' | 'g2' | 'g3')[], now: number) {
    const s = await setup()
    for (const who of guardians) {
      const [rec] = await guardianRecord(s[who], now)
      const action = rec === undefined ? null : releaseAction(rec, now)
      if (action === null) throw new Error('expected a release')
      await s[who].sendMemos(action)
    }
    return s
  }

  it('shows how many shares have arrived, and opens at the threshold', async () => {
    const s = await released(['g1'], T0 + P + G + 1)
    let heirs = await ingestForHeir([], await s.heir.receivedMemos(), T0 + P + G + 2)
    expect(heirs).toHaveLength(1)
    expect(heirs[0]).toMatchObject({ threshold: 2, total: 3 })
    expect(shareCount(heirs[0]!)).toBe(1)
    expect(await openGuarded(heirs[0]!)).toEqual({ ok: false, reason: 'waiting' })

    const [rec2] = await guardianRecord(s.g2, T0 + P + G + 1)
    await s.g2.sendMemos(releaseAction(rec2!, T0 + P + G + 1)!)
    heirs = await ingestForHeir(heirs, await s.heir.receivedMemos(), T0 + P + G + 3)
    expect(shareCount(heirs[0]!)).toBe(2)
    const opened = await openGuarded(heirs[0]!)
    expect(opened).toMatchObject({ ok: true, content: { letter } })
  })

  it('opens with any two of three guardians, so one being offline does not matter', async () => {
    for (const pair of [
      ['g1', 'g2'],
      ['g2', 'g3'],
      ['g1', 'g3'],
    ] as const) {
      const s = await released([...pair], T0 + P + G + 1)
      const [item] = await ingestForHeir([], await s.heir.receivedMemos(), 1)
      expect((await openGuarded(item!)).ok).toBe(true)
    }
  })

  it('and sweeps the gift', async () => {
    const s = await released(['g1', 'g3'], T0 + P + G + 1)
    const [item] = await ingestForHeir([], await s.heir.receivedMemos(), 1)
    const opened = await openGuarded(item!)
    if (!opened.ok || opened.content.giftSeed === undefined) throw new Error('expected a seed')
    expect(await sweepGift(s.heir, opened.content.giftSeed)).toMatchObject({
      ok: true,
      sweptZat: 100_000_000n - s.heir.fee,
    })
  })

  it('ignores shares for other letters or with the wrong threshold, and a bundle that is not guardian mode', async () => {
    const s = await released(['g1', 'g2'], T0 + P + G + 1)
    const other = await sealForGuardians({
      content: { letter: 'other' },
      heirAddress: HEIR,
      total: 5,
      threshold: 3,
      periodMs: P,
      graceMs: G,
      nowMs: T0,
    })
    const stray = toMemos(
      'SHARE_RELEASE',
      encodeRelease({ bundleId: other.bundleId, share: other.shares[0]! }),
    )
    const wrongSet = toMemos(
      'SHARE_RELEASE',
      encodeRelease({
        bundleId: hexBytes(s.record.bundleIdHex),
        share: other.shares[0]!,
      }),
    )
    const [item] = await ingestForHeir(
      [],
      [...(await s.heir.receivedMemos()), ...stray, ...wrongSet],
      1,
    )
    expect(shareCount(item!)).toBe(2)
    expect((await openGuarded(item!)).ok).toBe(true)
  })

  it('still opens if a bogus share is mixed in, and reports a mismatch if there are not enough real ones', async () => {
    const s = await released(['g1', 'g2'], T0 + P + G + 1)
    const decoy = await sealForGuardians({
      content: { letter: 'decoy' },
      heirAddress: HEIR,
      total: 3,
      threshold: 2,
      periodMs: P,
      graceMs: G,
      nowMs: T0,
    })
    const bogus = toMemos(
      'SHARE_RELEASE',
      encodeRelease({
        bundleId: hexBytes(s.record.bundleIdHex),
        share: decoy.shares[2]!,
      }),
    )
    const [mixed] = await ingestForHeir([], [...bogus, ...(await s.heir.receivedMemos())], 1)
    expect(shareCount(mixed!)).toBe(3)
    expect(await openGuarded(mixed!)).toMatchObject({ ok: true, content: { letter } })

    const one = await released(['g1'], T0 + P + G + 1)
    const onlyBogus = toMemos(
      'SHARE_RELEASE',
      encodeRelease({
        bundleId: hexBytes(one.record.bundleIdHex),
        share: decoy.shares[2]!,
      }),
    )
    const [weak] = await ingestForHeir([], [...(await one.heir.receivedMemos()), ...onlyBogus], 1)
    expect(await openGuarded(weak!)).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('handles a release that arrives before the letter in the same batch, and repeated shares', async () => {
    const s = await released(['g1', 'g2'], T0 + P + G + 1)
    const memos = await s.heir.receivedMemos()
    const [item] = await ingestForHeir([], [...memos].reverse().concat(memos), 1)
    expect(shareCount(item!)).toBe(2)
  })

  it('cannot open the letter alone or with a single share', async () => {
    const s = await released(['g1'], T0 + P + G + 1)
    const [item] = await ingestForHeir([], await s.heir.receivedMemos(), 1)
    expect((await openGuarded(item!)).ok).toBe(false)
  })
})

describe('demo scenario: the owner checks in once, then stops', () => {
  it('after P + G the guardians release, the heir opens the letter and claims the funds; a forged check-in is rejected', async () => {
    const s = await setup()
    // Owner checks in once, 60 s in, then stops.
    const T1 = T0 + 60_000
    await ownerCheckIn(s.owner, s.record, T1)

    let g1: GuardianRecord[] = []
    let g2: GuardianRecord[] = []
    g1 = await guardianRecord(s.g1, T1 + 1000, g1)
    g2 = await guardianRecord(s.g2, T1 + 1000, g2)
    expect(guardStatus(g1[0]!, T1 + P - 1)).toBe('ok')

    // An attacker tries a forged check-in on guardian one at the last minute.
    const forged = signCheckIn(generateKeypair().privateKey, {
      bundleId: g1[0]?.policy.bundleId ?? new Uint8Array(16),
      counter: 50,
      timestampMs: T1 + P,
    })
    const attacked = await ingestForGuardian(g1, toMemos('CHECKIN', forged), T1 + P)
    expect(attacked.events[0]).toMatchObject({
      kind: 'rejected-check-in',
      reason: 'invalid-signature',
    })
    g1 = attacked.records
    expect(guardStatus(g1[0]!, T1 + P)).toBe('overdue')

    // One second before P + G there is no release; one second after, there is.
    const early = T1 + P + G - 1000
    const late = T1 + P + G + 1000
    expect(releaseAction(g1[0]!, early)).toBeNull()
    for (const [wallet, records] of [
      [s.g1, g1],
      [s.g2, g2],
    ] as const) {
      const action = releaseAction(records[0]!, late)
      if (action === null) throw new Error('expected a release')
      await wallet.sendMemos(action)
    }

    // The heir checks, opens and claims.
    const state = await checkIncoming(s.heir, { guardians: [], owned: [], heirs: [] }, late + 1000)
    const [item] = state.heirs
    const opened = await openGuarded(item!)
    if (!opened.ok) throw new Error('expected the letter to open')
    expect(opened.content.letter).toBe(letter)
    expect(await sweepGift(s.heir, opened.content.giftSeed ?? '')).toMatchObject({ ok: true })
  })

  it('does not release at all if the owner keeps checking in', async () => {
    const s = await setup()
    let record = s.record
    let guard: GuardianRecord[] = []
    for (let i = 1; i <= 5; i++) {
      const at = T0 + i * (P - 10_000)
      record = (await ownerCheckIn(s.owner, record, at)).record
      guard = await guardianRecord(s.g1, at + 100, guard)
      expect(guardStatus(guard[0]!, at + P - 1)).toBe('ok')
      expect(releaseAction(guard[0]!, at + P - 1)).toBeNull()
    }
  })

  it('checkIncoming updates all three roles from one read', async () => {
    const s = await setup()
    const g = await checkIncoming(s.g1, { guardians: [], owned: [], heirs: [] }, T0 + 1000)
    expect(g.guardians).toHaveLength(1)
    expect(g.heirs).toHaveLength(0)
    const h = await checkIncoming(s.heir, { guardians: [], owned: [], heirs: [] }, T0 + 1000)
    expect(h.heirs).toHaveLength(1)
    expect(h.guardians).toHaveLength(0)
  })
})

function hexBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}
