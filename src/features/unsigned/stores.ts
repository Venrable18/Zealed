import { create } from 'zustand'
import type { Card } from './card.ts'
import type { UnsignedMessage } from './inbox.ts'

interface UnsignedState {
  card: Card | null
  messages: UnsignedMessage[]
  repliedIds: string[]
  setCard: (card: Card) => void
  setMessages: (messages: UnsignedMessage[]) => void
  markReplied: (id: string) => void
}

/**
 * Held in memory only for now: lost on reload. Messages are private and the card is not meant to
 * be tracked, so neither is written to plaintext storage. Encrypted wallet storage (Phase 3) will
 * persist them.
 */
export const useUnsigned = create<UnsignedState>()((set) => ({
  card: null,
  messages: [],
  repliedIds: [],
  // A new card replaces the old one and starts with an empty inbox.
  setCard: (card) => {
    set({ card, messages: [], repliedIds: [] })
  },
  setMessages: (messages) => {
    set({ messages })
  },
  markReplied: (id) => {
    set((state) =>
      state.repliedIds.includes(id) ? state : { repliedIds: [...state.repliedIds, id] },
    )
  },
}))
