import { create } from 'zustand'
import type { GuardianRecord } from './guardian.ts'
import type { HeirItem } from './heir.ts'
import type { OwnerRecord } from './owner.ts'

interface SilentState {
  owned: OwnerRecord[]
  guardians: GuardianRecord[]
  heirs: HeirItem[]
  setOwned: (owned: OwnerRecord[]) => void
  upsertOwned: (record: OwnerRecord) => void
  setGuardians: (guardians: GuardianRecord[]) => void
  setHeirs: (heirs: HeirItem[]) => void
}

/**
 * Held in memory only for now: lost on reload. These hold secrets (the owner's check-in private
 * key, a guardian's key share, the heir's collected shares), so they must only ever be persisted
 * encrypted. Encrypted wallet storage (Phase 3) will do that.
 */
export const useSilent = create<SilentState>()((set) => ({
  owned: [],
  guardians: [],
  heirs: [],
  setOwned: (owned) => {
    set({ owned })
  },
  upsertOwned: (record) => {
    set((state) =>
      state.owned.some((r) => r.bundleIdHex === record.bundleIdHex)
        ? { owned: state.owned.map((r) => (r.bundleIdHex === record.bundleIdHex ? record : r)) }
        : { owned: [record, ...state.owned] },
    )
  },
  setGuardians: (guardians) => {
    set({ guardians })
  },
  setHeirs: (heirs) => {
    set({ heirs })
  },
}))
