import { describe, expect, it } from 'vitest'
import { DEMO_TIMERS, STANDARD_TIMERS, getTimers, parseDemoParam } from './demo.ts'

describe('parseDemoParam', () => {
  it('reads the demo flag from the query string', () => {
    expect(parseDemoParam('?demo=1')).toBe(true)
    expect(parseDemoParam('?foo=bar&demo=true')).toBe(true)
    expect(parseDemoParam('?demo=0')).toBe(false)
    expect(parseDemoParam('?demo=false')).toBe(false)
  })

  it('returns undefined when the flag is absent or unrecognized', () => {
    expect(parseDemoParam('')).toBeUndefined()
    expect(parseDemoParam('?demo=yes')).toBeUndefined()
  })
})

describe('getTimers', () => {
  it('shortens every timer in demo mode', () => {
    expect(DEMO_TIMERS.potBatchIntervalMs).toBeLessThan(STANDARD_TIMERS.potBatchIntervalMs)
    expect(DEMO_TIMERS.potPieceDelayMs.max).toBeLessThan(STANDARD_TIMERS.potPieceDelayMs.max)
    expect(DEMO_TIMERS.checkInPeriodMs).toBeLessThan(STANDARD_TIMERS.checkInPeriodMs)
    expect(DEMO_TIMERS.gracePeriodMs).toBeLessThan(STANDARD_TIMERS.gracePeriodMs)
    expect(DEMO_TIMERS.defaultUnlockDelayMs).toBeLessThan(STANDARD_TIMERS.defaultUnlockDelayMs)
  })

  it('uses the plan-specified demo periods', () => {
    const timers = getTimers(true)
    expect(timers.potBatchIntervalMs).toBe(60_000)
    expect(timers.checkInPeriodMs).toBe(120_000)
    expect(timers.gracePeriodMs).toBe(60_000)
    expect(timers.defaultUnlockDelayMs).toBe(30_000)
  })

  it('applies overrides on top of the mode defaults', () => {
    const timers = getTimers(false, { gracePeriodMs: 5 })
    expect(timers.gracePeriodMs).toBe(5)
    expect(timers.checkInPeriodMs).toBe(STANDARD_TIMERS.checkInPeriodMs)
  })
})
