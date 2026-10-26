import { createContext, useContext } from 'react'
import { create } from 'zustand'
import { EMPTY_SHARED_STATE, flush, type SharedState } from './engine.ts'
import type { SharedPotPort } from './port.ts'

/** Shared pots and their messages. Private (key shares among them): kept in the vault. */
export const useSharedPots = create<{ state: SharedState }>()(() => ({ state: EMPTY_SHARED_STATE }))

let queue: Promise<unknown> = Promise.resolve()

/**
 * Runs one change to the shared pots, after any change already running, and saves the result.
 * Everything that touches them goes through here, so the background pass and a person's action
 * never overwrite each other.
 */
export function runShared(task: (state: SharedState) => Promise<SharedState>): Promise<void> {
  const run = queue.then(async () => {
    const next = await task(useSharedPots.getState().state)
    useSharedPots.setState({ state: next })
  })
  queue = run.catch(() => undefined)
  return run
}

/** Runs a person's action, then sends what it produced straight away. */
export function actShared(
  port: SharedPotPort,
  action: (state: SharedState) => Promise<SharedState> | SharedState,
): Promise<void> {
  return runShared(async (state) => flush(port, await action(state)))
}

export function validSharedState(data: unknown): SharedState | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if (!Array.isArray(d['pots']) || !Array.isArray(d['seen']) || !Array.isArray(d['outbox']))
    return null
  return {
    pots: d['pots'] as SharedState['pots'],
    seen: d['seen'] as string[],
    outbox: d['outbox'] as SharedState['outbox'],
  }
}

/** The wallet as shared pots need it. `null` until a wallet that supports them is open. */
export const SharedPotContext = createContext<SharedPotPort | null>(null)

export function useSharedPotPort(): SharedPotPort | null {
  return useContext(SharedPotContext)
}
