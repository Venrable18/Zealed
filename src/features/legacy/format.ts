/** "utest1abc…xyz789": enough to recognise an address without showing all of it. */
export function shortAddress(address: string): string {
  return address.length <= 20 ? address : `${address.slice(0, 10)}…${address.slice(-6)}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Value for <input type="datetime-local" step="1"> in the person's own time zone. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Reads a datetime-local value as local time. Returns NaN if it is empty or invalid. */
export function fromLocalInput(value: string): number {
  return value === '' ? Number.NaN : new Date(value).getTime()
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * How far ahead a time is, in words a person checks against what they meant: "in about 3 days",
 * "in about 12 months". Returns an empty string for a time that is not in the future.
 */
export function describeFromNow(targetMs: number, nowMs: number): string {
  const gap = targetMs - nowMs
  if (!Number.isFinite(gap) || gap <= 0) return ''
  const plural = (n: number, unit: string) => `${String(n)} ${unit}${n === 1 ? '' : 's'}`
  if (gap < HOUR) return `in about ${plural(Math.max(1, Math.round(gap / MINUTE)), 'minute')}`
  if (gap < DAY) return `in about ${plural(Math.round(gap / HOUR), 'hour')}`
  if (gap < 60 * DAY) return `in about ${plural(Math.round(gap / DAY), 'day')}`
  if (gap < 2 * 365 * DAY) return `in about ${plural(Math.round(gap / (30.44 * DAY)), 'month')}`
  return `in about ${plural(Math.round(gap / (365.25 * DAY)), 'year')}`
}
