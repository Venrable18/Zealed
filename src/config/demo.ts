/**
 * Demo mode shortens every timer so each flow can be shown live. It is switched on with
 * `?demo=1` (and off with `?demo=0`) or the settings toggle.
 */

export const DEMO_QUERY_PARAM = 'demo'

/** Returns the demo flag if the query string sets it, otherwise `undefined`. */
export function parseDemoParam(search: string): boolean | undefined {
  const value = new URLSearchParams(search).get(DEMO_QUERY_PARAM)
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return undefined
}

export interface Timers {
  /** Blind Pot: how often the host's displayed total refreshes. */
  potBatchIntervalMs: number
  /** Blind Pot: random extra delay added between contribution pieces. */
  potPieceDelayMs: { min: number; max: number }
  /** Legacy Mode B: owner check-in period (P). */
  checkInPeriodMs: number
  /** Legacy Mode B: grace period after a missed check-in before shares are released (G). */
  gracePeriodMs: number
  /** Legacy Mode A: unlock delay the compose screen suggests. */
  defaultUnlockDelayMs: number
}

const SECOND = 1_000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE

export const STANDARD_TIMERS: Readonly<Timers> = {
  potBatchIntervalMs: 60 * MINUTE,
  potPieceDelayMs: { min: 1 * MINUTE, max: 5 * MINUTE },
  checkInPeriodMs: 30 * DAY,
  gracePeriodMs: 7 * DAY,
  defaultUnlockDelayMs: 365 * DAY,
}

export const DEMO_TIMERS: Readonly<Timers> = {
  potBatchIntervalMs: 60 * SECOND,
  potPieceDelayMs: { min: 2 * SECOND, max: 10 * SECOND },
  checkInPeriodMs: 2 * MINUTE,
  gracePeriodMs: 1 * MINUTE,
  defaultUnlockDelayMs: 30 * SECOND,
}

/** Timers for the current mode, with optional per-value overrides. */
export function getTimers(demoMode: boolean, overrides: Partial<Timers> = {}): Timers {
  return { ...(demoMode ? DEMO_TIMERS : STANDARD_TIMERS), ...overrides }
}
