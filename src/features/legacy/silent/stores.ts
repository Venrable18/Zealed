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
 * Held in memory, and saved only to the encrypted vault (src/storage/persistence.ts). These hold
 * secrets (the owner's check-in private key, a guardian's key share, the heir's collected shares),
 * so they must never be persisted any other way.
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
