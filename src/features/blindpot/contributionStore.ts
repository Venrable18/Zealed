import type { Contribution } from './queue.ts'

/**
 * Where an unfinished gift is kept so it can resume. It holds the pot address, amounts and the
 * wish, so it must be stored encrypted. Until wallet storage (Phase 3) exists, only the
 * in-memory version is available, which is lost on reload.
 */
export interface ContributionStore {
  load(potId: string): Promise<Contribution | undefined>
  save(contribution: Contribution): Promise<void>
  clear(potId: string): Promise<void>
}

export function createMemoryContributionStore(): ContributionStore {
  const byPot = new Map<string, Contribution>()
  return {
    load: (potId) => Promise.resolve(byPot.get(potId)),
    save: (contribution) => {
      byPot.set(contribution.potId, contribution)
      return Promise.resolve()
    },
    clear: (potId) => {
      byPot.delete(potId)
      return Promise.resolve()
    },
  }
}

/** Shared for the lifetime of the page. Replaced by encrypted storage in Phase 3. */
export const memoryContributionStore = createMemoryContributionStore()
