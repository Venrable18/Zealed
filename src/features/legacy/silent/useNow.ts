import { useEffect, useState } from 'react'

function currentTime(): number {
  return Date.now()
}

/** The current time, refreshed every `intervalMs`, for screens whose status depends on the clock. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(currentTime)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(currentTime())
    }, intervalMs)
    return () => {
      window.clearInterval(timer)
    }
  }, [intervalMs])
  return now
}

export { currentTime }
