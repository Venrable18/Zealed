import { describe, expect, it } from 'vitest'
import { describeCountdown, formatCountdown, remaining } from './countdown.ts'
import { MAX_SUPPLY_ZAT, formatZec, parseZec } from './zec.ts'

describe('parseZec', () => {
  it.each([
    ['1', 100_000_000n],
    ['0.001', 100_000n],
    ['.5', 50_000_000n],
    ['5.', 500_000_000n],
    ['  0.00000001 ', 1n],
    ['0', 0n],
    ['21000000', MAX_SUPPLY_ZAT],
  ])('reads %j', (text, zat) => {
    expect(parseZec(text)).toEqual({ ok: true, zat })
  })

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['.', 'invalid'],
    ['abc', 'invalid'],
    ['-1', 'invalid'],
    ['1e3', 'invalid'],
    ['1,5', 'invalid'],
    ['1.2.3', 'invalid'],
    ['0.000000001', 'too-many-decimals'],
    ['21000000.00000001', 'too-large'],
    ['99999999999999999999', 'too-large'],
  ] as const)('rejects %j as %s', (text, reason) => {
    expect(parseZec(text)).toEqual({ ok: false, reason })
  })

  it('has no floating-point error', () => {
    expect(parseZec('0.1')).toEqual({ ok: true, zat: 10_000_000n })
    expect(parseZec('0.3')).toEqual({ ok: true, zat: 30_000_000n })
  })
})

describe('formatZec', () => {
  it('trims trailing zeros by default', () => {
    expect(formatZec(0n)).toBe('0')
    expect(formatZec(100_000n)).toBe('0.001')
    expect(formatZec(100_000_000n)).toBe('1')
    expect(formatZec(150_000_000n)).toBe('1.5')
    expect(formatZec(1n)).toBe('0.00000001')
  })

  it('can show all 8 decimals', () => {
    expect(formatZec(100_000n, { fixed: true })).toBe('0.00100000')
  })

  it('groups thousands and handles negatives', () => {
    expect(formatZec(123_456_789_000_000n)).toBe('1,234,567.89')
    expect(formatZec(-50_000_000n)).toBe('-0.5')
  })

  it('round-trips with parseZec', () => {
    for (const zat of [0n, 1n, 99_999_999n, 100_000n, 123_456_789n, MAX_SUPPLY_ZAT]) {
      expect(parseZec(formatZec(zat).replaceAll(',', ''))).toEqual({ ok: true, zat })
    }
  })
})

describe('countdown', () => {
  const start = 1_000_000

  it('counts down and never goes below zero', () => {
    expect(remaining(start + 90_000, start)).toMatchObject({ minutes: 1, seconds: 30, done: false })
    expect(remaining(start, start + 5000)).toMatchObject({ totalMs: 0, seconds: 0, done: true })
  })

  it('rounds partial seconds up, so it never shows 00:00 early', () => {
    expect(remaining(start + 400, start)).toMatchObject({ seconds: 1, done: false })
  })

  it('formats by size', () => {
    const day = 86_400_000
    expect(
      formatCountdown(remaining(start + 3 * day + 4 * 3_600_000 + 5 * 60_000 + 6000, start)),
    ).toBe('3d 04:05:06')
    expect(formatCountdown(remaining(start + 3_600_000 + 1000, start))).toBe('01:00:01')
    expect(formatCountdown(remaining(start + 65_000, start))).toBe('01:05')
    expect(formatCountdown(remaining(start, start))).toBe('00:00')
  })

  it('describes for screen readers', () => {
    expect(describeCountdown(remaining(start + 10 * 60_000, start))).toBe('10 minutes')
    expect(describeCountdown(remaining(start + 61 * 60_000, start))).toBe('1 hour, 1 minute')
    expect(describeCountdown(remaining(start + 30_000, start))).toBe('30 seconds')
    expect(describeCountdown(remaining(start, start))).toBe('No time left')
  })
})
