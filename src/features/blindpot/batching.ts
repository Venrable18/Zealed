export interface BatchWindow {
  /** The most recent batch boundary (Unix ms). The host's total is as of this moment. */
  lastMs: number
  /** When the total next refreshes. */
  nextMs: number
}

/**
 * Batch boundaries fall at `anchorMs + k * intervalMs`. The total shown to the host is the
 * balance as of the last boundary, so it is the same however often or whenever they look.
 */
export function batchWindow(nowMs: number, anchorMs: number, intervalMs: number): BatchWindow {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0)
    throw new RangeError('interval must be positive')
  const elapsed = Math.max(0, nowMs - anchorMs)
  const lastMs = anchorMs + Math.floor(elapsed / intervalMs) * intervalMs
  return { lastMs, nextMs: lastMs + intervalMs }
}

/** "60 minutes", "1 hour", "30 seconds" */
export function describeInterval(ms: number): string {
  const unit = (n: number, name: string) => `${String(n)} ${name}${n === 1 ? '' : 's'}`
  if (ms % 3_600_000 === 0) return unit(ms / 3_600_000, 'hour')
  if (ms % 60_000 === 0) return unit(ms / 60_000, 'minute')
  return unit(Math.round(ms / 1000), 'second')
}
