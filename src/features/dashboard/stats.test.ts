import { describe, expect, it } from 'vitest'
import { fullScenario, DEFAULT_NOW as NOW } from './scenario.ts'
import { computeDashboard, type DashboardInput } from './stats.ts'

const ZEC = 100_000_000n
const MINUTE = 60_000

describe('computeDashboard after the earlier scenarios', () => {
  it('shows the wallet balance', async () => {
    const stats = computeDashboard(await fullScenario())
    expect(stats.wallet).toEqual({ spendableZat: 3n * ZEC + 25_000_000n, pendingZat: 10_000_000n })
  })

  it('counts pots and totals only what the host is allowed to see: the total as of the last batch', async () => {
    const { pots } = computeDashboard(await fullScenario())
    expect(pots).toMatchObject({ count: 2, open: 1, closed: 1, counted: 2 })
    // 0.1 + 0.5 ZEC arrived before the last batch boundary; the 5 ZEC gift arrived after it and is not shown yet.
    expect(pots.totalZat).toBe(ZEC / 10n + ZEC / 2n)
    expect(pots.lines[0]).toMatchObject({
      name: 'Ada and Tunde',
      closed: false,
      totalZat: 60_000_000n,
      strength: 'weak',
    })
    expect(pots.lines[1]).toMatchObject({
      name: 'Old pot',
      closed: true,
      totalZat: 0n,
      strength: 'none',
    })
  })

  it('has no per-payment fields anywhere', async () => {
    const stats = computeDashboard(await fullScenario())
    const keys = (value: unknown): string[] =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)])
        : Array.isArray(value)
          ? value.flatMap(keys)
          : []
    for (const key of keys(stats))
      expect(key).not.toMatch(/payment|gift|piece|wish|memo|txid|address|body/i)
  })

  it('counts Legacy: sent and undelivered letters, sealed for you (ready and locked)', async () => {
    const { legacy } = computeDashboard(await fullScenario())
    expect(legacy.sent).toBe(1)
    expect(legacy.notDelivered).toBe(1)
    expect(legacy.sealedForYou).toEqual({ total: 2, ready: 1, locked: 1 })
  })

  it('knows the next check-in due and whether it is overdue', async () => {
    const input = await fullScenario()
    const { legacy } = computeDashboard(input)
    // Letter A was last checked in 10 minutes ago with a 2 minute period (overdue); letter B is fine.
    expect(legacy.silent).toMatchObject({ active: 2, revoked: 0, overdue: true, pendingSends: 0 })
    expect(legacy.silent.nextCheckInMs).toBe(NOW - 10 * MINUTE + 2 * MINUTE)

    const onlyB = computeDashboard({
      ...input,
      owned: [input.owned[1]!],
    })
    expect(onlyB.legacy.silent).toMatchObject({ active: 1, overdue: false })
    expect(onlyB.legacy.silent.nextCheckInMs).toBe(NOW - 10_000 + 2 * MINUTE)
  })

  it('counts people you guard by status, and letters waiting for you', async () => {
    const { legacy } = computeDashboard(await fullScenario())
    // This guardian holds two letters: A (long overdue, now past its grace period) and B (checked in 10 s ago).
    expect(legacy.guarding).toMatchObject({
      total: 2,
      ok: 1,
      releasing: 1,
      overdue: 0,
      released: 0,
      revoked: 0,
    })
    // Two guardians released a share for letter A, which meets its threshold of 2.
    expect(legacy.waitingForYou).toEqual({ total: 2, ready: 1 })
  })

  it('does not count revoked letters as active', async () => {
    const input = await fullScenario()
    const revoked = input.owned.map((r, i) => (i === 0 ? { ...r, revoked: true } : r))
    expect(computeDashboard({ ...input, owned: revoked }).legacy.silent).toMatchObject({
      active: 1,
      revoked: 1,
      overdue: false,
    })
  })

  it('counts Unsigned: messages that met the minimum, the hidden folder, earnings and messages sent', async () => {
    const { unsigned } = computeDashboard(await fullScenario())
    expect(unsigned).toEqual({
      hasCard: true,
      received: 2,
      belowMinimum: 1,
      earnedZat: 2n * ZEC + 5_000_000n + 1_000_000n,
      sent: 1,
    })
  })

  it('moves with the clock: a locked letter becomes ready, a due check-in becomes overdue', async () => {
    const input = await fullScenario()
    const later = computeDashboard({ ...input, nowMs: NOW + 25 * 60 * MINUTE })
    expect(later.legacy.sealedForYou).toEqual({ total: 2, ready: 2, locked: 0 })
    expect(later.legacy.silent.overdue).toBe(true)
  })
})

describe('computeDashboard with nothing', () => {
  it('is all zeros and says there is no wallet', () => {
    const empty: DashboardInput = {
      nowMs: NOW,
      balance: null,
      pots: [],
      potViews: {},
      legacySent: [],
      legacyInbox: [],
      owned: [],
      guardians: [],
      heirs: [],
      card: null,
      messages: [],
      sentMessages: [],
    }
    expect(computeDashboard(empty)).toEqual({
      wallet: null,
      pots: { count: 0, open: 0, closed: 0, totalZat: 0n, counted: 0, lines: [] },
      legacy: {
        sent: 0,
        notDelivered: 0,
        sealedForYou: { total: 0, ready: 0, locked: 0 },
        silent: { active: 0, revoked: 0, nextCheckInMs: null, overdue: false, pendingSends: 0 },
        guarding: { total: 0, ok: 0, overdue: 0, releasing: 0, released: 0, revoked: 0 },
        waitingForYou: { total: 0, ready: 0 },
      },
      unsigned: { hasCard: false, received: 0, belowMinimum: 0, earnedZat: 0n, sent: 0 },
    })
  })

  it('leaves out a pot total that could not be read, rather than guessing', async () => {
    const input = await fullScenario()
    const missing = computeDashboard({ ...input, potViews: {} })
    expect(missing.pots).toMatchObject({ count: 2, counted: 0, totalZat: 0n })
    expect(
      missing.pots.lines.every((line) => line.totalZat === null && line.strength === null),
    ).toBe(true)
  })
})
