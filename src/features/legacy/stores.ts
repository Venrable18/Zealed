import { create } from 'zustand'
import type { InboxItem, SentItem } from './types.ts'

interface LegacyState {
  sent: SentItem[]
  inbox: InboxItem[]
  addSent: (item: SentItem) => void
  replaceSent: (item: SentItem) => void
  addInbox: (items: InboxItem[]) => void
}

/**
 * Held in memory only for now: lost on reload. Sent items can hold a gift wallet's seed while
 * delivery has failed, so they must never go to plaintext storage. Encrypted wallet storage
 * (Phase 3) will persist them.
 */
export const useLegacy = create<LegacyState>()((set) => ({
  sent: [],
  inbox: [],
  addSent: (item) => {
    set((state) => ({ sent: [item, ...state.sent] }))
  },
  replaceSent: (item) => {
    set((state) => ({
      sent: state.sent.map((existing) => (existing.id === item.id ? item : existing)),
    }))
  },
  addInbox: (items) => {
    set((state) => {
      const known = new Set(state.inbox.map((item) => item.bundleIdHex))
      const fresh = items.filter((item) => !known.has(item.bundleIdHex))
      return fresh.length === 0 ? state : { inbox: [...fresh, ...state.inbox] }
    })
  },
}))
