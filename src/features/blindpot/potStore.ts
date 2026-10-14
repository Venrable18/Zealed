import { create } from 'zustand'
import type { Pot } from './types.ts'

interface PotState {
  pots: Pot[]
  add: (pot: Pot) => void
  markClosed: (id: string) => void
}

/**
 * Pots the host has created. Held in memory only for now: they are lost on reload. Wallet
 * storage (Phase 3) will persist them encrypted. They are deliberately not written to
 * localStorage, because the pot's name and dates are private.
 */
export const usePots = create<PotState>()((set) => ({
  pots: [],
  add: (pot) => {
    set((state) => ({ pots: [...state.pots, pot] }))
  },
  markClosed: (id) => {
    set((state) => ({
      pots: state.pots.map((pot) => (pot.id === id ? { ...pot, closed: true } : pot)),
    }))
  },
}))
