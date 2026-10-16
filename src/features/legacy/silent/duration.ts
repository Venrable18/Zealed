export type Unit = 'seconds' | 'minutes' | 'hours' | 'days'

export const UNIT_MS: Record<Unit, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
}

/** Picks the largest unit that divides the time exactly, e.g. 120000 becomes 2 minutes. */
export function splitDuration(ms: number): { value: string; unit: Unit } {
  for (const unit of ['days', 'hours', 'minutes'] as const) {
    if (ms % UNIT_MS[unit] === 0) return { value: String(ms / UNIT_MS[unit]), unit }
  }
  return { value: String(Math.round(ms / 1000)), unit: 'seconds' }
}

/** Reads "2" and "minutes" as milliseconds. NaN if the number is not valid. */
export function joinDuration(value: string, unit: Unit): number {
  const n = Number(value)
  return value.trim() === '' || !Number.isFinite(n) || n <= 0
    ? Number.NaN
    : Math.round(n * UNIT_MS[unit])
}

/** "2 minutes", "1 day", "90 seconds" */
export function describeDuration(ms: number): string {
  const { value, unit } = splitDuration(ms)
  return `${value} ${value === '1' ? unit.slice(0, -1) : unit}`
}
