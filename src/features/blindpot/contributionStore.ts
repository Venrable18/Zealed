import type { Contribution } from './queue.ts'

/**
 * Where an unfinished gift is kept so it can resume. It holds the pot address, amounts and the
 * wish, so it is only ever saved encrypted, in the vault (see `src/storage/persistence.ts`). Without
 * a vault it lives in memory and is lost on reload.
 */
export interface ContributionStore {
  load(potId: string): Promise<Contribution | undefined>
  save(contribution: Contribution): Promise<void>
  clear(potId: string): Promise<void>
}

export interface MemoryContributionStore extends ContributionStore {
  clearAll: () => void
  /** Everything held, for saving into the vault. */
  entries: () => Contribution[]
  /** Replaces everything, when saved data is loaded. */
  restore: (entries: Contribution[]) => void
  /** Called after every change. Returns a function that stops listening. */
  subscribe: (listener: () => void) => () => void
}

export function createMemoryContributionStore(): MemoryContributionStore {
  const byPot = new Map<string, Contribution>()
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const listener of listeners) listener()
  }
  return {
    load: (potId) => Promise.resolve(byPot.get(potId)),
    save: (contribution) => {
      byPot.set(contribution.potId, contribution)
      changed()
      return Promise.resolve()
    },
    clear: (potId) => {
      byPot.delete(potId)
      changed()
      return Promise.resolve()
    },
    clearAll: () => {
      byPot.clear()
      changed()
    },
    entries: () => [...byPot.values()],
    restore: (entries) => {
      byPot.clear()
      for (const entry of entries) byPot.set(entry.potId, entry)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Shared for the lifetime of the page. */
export const memoryContributionStore = createMemoryContributionStore()
