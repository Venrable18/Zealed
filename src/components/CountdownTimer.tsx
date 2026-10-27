import { useEffect, useState } from 'react'
import { describeCountdown, formatCountdown, remaining } from '../lib/countdown.ts'

interface CountdownTimerProps {
  /** Unix milliseconds. */
  targetMs: number
  /** Called once when the countdown reaches zero. */
  onDone?: () => void
  /** Text shown after it ends. */
  doneLabel?: string
}

/**
 * Ticks once a second. The visible digits are hidden from screen readers (they would be read
 * every second); a spoken summary is exposed instead and changes only when a minute passes.
 */
export function CountdownTimer({
  targetMs,
  onDone,
  doneLabel = 'Time is up',
}: CountdownTimerProps) {
  const [now, setNow] = useState(() => Date.now())
  const left = remaining(targetMs, now)

  useEffect(() => {
    if (left.done) return
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [left.done])

  useEffect(() => {
    if (left.done) onDone?.()
    // onDone is intentionally not a dependency: it fires once when the countdown ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left.done])

  if (left.done) return <p className="font-medium">{doneLabel}</p>

  return (
    <p>
      <span aria-hidden="true" className="font-display text-3xl font-semibold">
        {formatCountdown(left)}
      </span>
      <span className="sr-only">{describeCountdown(left)} left</span>
    </p>
  )
}
