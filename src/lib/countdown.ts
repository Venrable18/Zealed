export interface Remaining {
  totalMs: number
  days: number
  hours: number
  minutes: number
  seconds: number
  done: boolean
}

/** Time left until `targetMs`, clamped at zero. Both arguments are Unix milliseconds. */
export function remaining(targetMs: number, nowMs: number): Remaining {
  const totalMs = Math.max(0, targetMs - nowMs)
  const totalSeconds = Math.ceil(totalMs / 1000)
  return {
    totalMs,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: totalMs === 0,
  }
}

const two = (n: number) => String(n).padStart(2, '0')

/** "3d 04:05:06" with days, "04:05:06" with hours, otherwise "05:06". */
export function formatCountdown({ days, hours, minutes, seconds }: Remaining): string {
  if (days > 0) return `${String(days)}d ${two(hours)}:${two(minutes)}:${two(seconds)}`
  if (hours > 0) return `${two(hours)}:${two(minutes)}:${two(seconds)}`
  return `${two(minutes)}:${two(seconds)}`
}

/** Spoken form for screen readers, e.g. "3 days, 4 hours, 5 minutes". Seconds only under a minute. */
export function describeCountdown({ days, hours, minutes, seconds, done }: Remaining): string {
  if (done) return 'No time left'
  const unit = (n: number, name: string) => `${String(n)} ${name}${n === 1 ? '' : 's'}`
  const parts: string[] = []
  if (days > 0) parts.push(unit(days, 'day'))
  if (hours > 0) parts.push(unit(hours, 'hour'))
  if (minutes > 0) parts.push(unit(minutes, 'minute'))
  if (days === 0 && hours === 0 && minutes === 0) parts.push(unit(seconds, 'second'))
  return parts.join(', ')
}
