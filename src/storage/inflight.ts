/**
 * Work that must not be cut off by locking the app: a letter being sealed and sent, a gift being
 * given. Locking clears what is in memory and saves nothing more, so a send that finishes after a
 * lock would add its record to a list that is then thrown away, and the record would be lost even
 * though the transaction went out. Locking waits for this work to end.
 */
let count = 0
const waiters = new Set<() => void>()

/** Runs `task` and counts it as in flight until it settles, however it ends. */
export async function trackWork<T>(task: () => Promise<T>): Promise<T> {
  count++
  try {
    return await task()
  } finally {
    count--
    if (count === 0) {
      for (const resolve of [...waiters]) resolve()
      waiters.clear()
    }
  }
}

export function isWorking(): boolean {
  return count > 0
}

/** Resolves once nothing is in flight (at once, if nothing is). */
export function whenIdle(): Promise<void> {
  if (count === 0) return Promise.resolve()
  return new Promise((resolve) => {
    waiters.add(resolve)
  })
}
