import { useEffect, useMemo } from 'react'
import { useSharedPots } from '../blindpot/shared/store.ts'
import { useContacts } from '../contacts/contacts.ts'
import { findSealedLetters } from '../legacy/inbox.ts'
import { checkIncoming } from '../legacy/silent/incoming.ts'
import { useSilent } from '../legacy/silent/stores.ts'
import { useNow } from '../legacy/silent/useNow.ts'
import { useLegacy } from '../legacy/stores.ts'
import { readInbox } from '../unsigned/inbox.ts'
import { useUnsigned } from '../unsigned/stores.ts'
import { useWalletRuntime } from '../../wallet/runtime.ts'
import { collectNotifications, useNotificationsSeen, type Notification } from './notifications.ts'

/** Every notification, newest first, and which of them are unread. */
export function useNotifications(): { items: Notification[]; unread: Set<string> } {
  const sharedPots = useSharedPots((state) => state.state.pots)
  const letters = useLegacy((state) => state.inbox)
  const messages = useUnsigned((state) => state.messages)
  const guardians = useSilent((state) => state.guardians)
  const heirs = useSilent((state) => state.heirs)
  const contacts = useContacts((state) => state.contacts)
  const seen = useNotificationsSeen((state) => state.seen)
  // Letters become openable on their date, so the list is worked out again every minute.
  const nowMs = useNow(60_000)
  return useMemo(() => {
    const items = collectNotifications(
      { sharedPots, letters, messages, guardians, heirs, contacts },
      nowMs,
    )
    const read = new Set(seen)
    return { items, unread: new Set(items.filter((n) => !read.has(n.id)).map((n) => n.id)) }
  }, [sharedPots, letters, messages, guardians, heirs, contacts, seen, nowMs])
}

const EVERY_MS = 30_000

/**
 * Looks for new letters, guardian messages and Unsigned messages while a wallet is open, so they
 * show up as notifications without a visit to each page. Quiet: problems are retried next time.
 * Co-host invitations come in through the shared pots loop.
 */
export function useInboxLoop(): void {
  const wallet = useWalletRuntime((state) => state.wallet)
  useEffect(() => {
    if (wallet === null) return
    let stopped = false
    // A function, so the check is made again after each wait rather than assumed unchanged.
    const isStopped = () => stopped
    let running = false
    const pass = async () => {
      if (isStopped() || running || document.visibilityState !== 'visible') return
      running = true
      try {
        const memos = await wallet.receivedMemos()
        const nowMs = Date.now()
        if (isStopped()) return
        useLegacy.getState().addInbox(await findSealedLetters(memos, nowMs))
        const silent = useSilent.getState()
        const result = await checkIncoming(
          { receivedMemos: () => Promise.resolve(memos) },
          silent,
          nowMs,
        )
        if (isStopped()) return
        silent.setOwned(result.owned)
        silent.setGuardians(result.guardians)
        silent.setHeirs(result.heirs)
        const { card, setMessages } = useUnsigned.getState()
        if (card !== null) {
          const found = await readInbox(await wallet.receivedTransactions(card.address), card)
          // A new card may have replaced this one while the wallet was being read.
          if (!isStopped() && useUnsigned.getState().card === card) setMessages(found)
        }
      } catch {
        // Tried again on the next pass.
      } finally {
        running = false
      }
    }
    void pass()
    const timer = setInterval(() => void pass(), EVERY_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [wallet])
}
