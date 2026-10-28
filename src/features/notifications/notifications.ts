import { create } from 'zustand'
import type { SharedPot } from '../blindpot/shared/types.ts'
import { findContact, type Contact } from '../contacts/contacts.ts'
import { formatDateTime } from '../legacy/format.ts'
import { guardStatus, type GuardianRecord } from '../legacy/silent/guardian.ts'
import { shareCount, type HeirItem } from '../legacy/silent/heir.ts'
import { letterStage, type InboxItem } from '../legacy/types.ts'
import type { UnsignedMessage } from '../unsigned/inbox.ts'
import { formatZec } from '../../lib/zec.ts'

export type NotificationKind = 'cohost' | 'withdrawal' | 'pot' | 'letter' | 'guardian' | 'message'

/** Something that needs this person's attention, and the page where they deal with it. */
export interface Notification {
  /** Stable, so a notification that was read stays read when it is worked out again. */
  id: string
  kind: NotificationKind
  title: string
  body: string
  to: string
  action: string
  atMs: number
}

/** What notifications are worked out from: the app's own stores, nothing else. */
export interface NotificationSources {
  sharedPots: readonly SharedPot[]
  letters: readonly InboxItem[]
  messages: readonly UnsignedMessage[]
  guardians: readonly GuardianRecord[]
  heirs: readonly HeirItem[]
  contacts: readonly Contact[]
}

const short = (address: string) => `${address.slice(0, 10)}…${address.slice(-6)}`

function nameFor(contacts: readonly Contact[], address: string): string {
  return findContact(contacts, address)?.name ?? short(address)
}

/** Every notification, newest first. */
export function collectNotifications(sources: NotificationSources, nowMs: number): Notification[] {
  const { contacts } = sources
  const out: Notification[] = []

  for (const pot of sources.sharedPots) {
    const host = pot.members.find((m) => m.index === 1)?.address ?? ''
    if (pot.role === 'cohost' && pot.status === 'invited')
      out.push({
        id: `cohost:${pot.id}`,
        kind: 'cohost',
        title: `${nameFor(contacts, host)} invites you to co-host “${pot.name}”`,
        body: `Any ${String(pot.threshold)} of the ${String(pot.members.length)} co-hosts together can move its money. Go to the Blind Pot page to accept or decline the invitation.`,
        to: '/blind-pot',
        action: 'Open Blind Pot to answer',
        atMs: pot.createdAtMs,
      })
    if (pot.role === 'cohost')
      for (const w of pot.withdrawals)
        if (w.status === 'pending')
          out.push({
            id: `withdrawal:${w.id}`,
            kind: 'withdrawal',
            title: `The host asks to move money out of “${pot.name}”`,
            body: 'Your approval is needed. Check where the money goes on the Blind Pot page, then approve or decline.',
            to: '/blind-pot',
            action: 'Review the request',
            atMs: w.createdAtMs,
          })
    if (pot.role === 'host' && pot.status === 'ready')
      out.push({
        id: `pot-ready:${pot.id}`,
        kind: 'pot',
        title: `“${pot.name}” is ready`,
        body: 'Every co-host accepted and the pot’s shared key is made. You can now share the pot’s link with guests.',
        to: '/blind-pot',
        action: 'Open Blind Pot',
        atMs: pot.createdAtMs,
      })
    if (pot.role === 'host' && pot.status === 'failed')
      out.push({
        id: `pot-failed:${pot.id}`,
        kind: 'pot',
        title: `“${pot.name}” was not made`,
        body: 'A co-host declined the invitation, so the shared pot could not be set up.',
        to: '/blind-pot',
        action: 'Open Blind Pot',
        atMs: pot.createdAtMs,
      })
  }

  for (const letter of sources.letters) {
    out.push({
      id: `letter:${letter.bundleIdHex}`,
      kind: 'letter',
      title: 'A sealed letter arrived for you',
      body: `${letter.hasGift === true ? 'It comes with a gift. ' : ''}It can be opened from ${formatDateTime(letter.unlockMs)}.`,
      to: '/legacy',
      action: 'Open Legacy',
      atMs: letter.receivedAtMs,
    })
    if (letterStage(letter, nowMs) === 'ready')
      out.push({
        id: `letter-ready:${letter.bundleIdHex}`,
        kind: 'letter',
        title: 'A sealed letter can now be opened',
        body:
          letter.openedAtMs === undefined
            ? 'Its date has come. Open it on the Legacy page.'
            : 'Its gift is still waiting to be moved into your wallet.',
        to: '/legacy',
        action: 'Open Legacy',
        atMs: letter.unlockMs,
      })
  }

  for (const record of sources.guardians) {
    out.push({
      id: `guardian:${record.bundleIdHex}`,
      kind: 'guardian',
      title: `${nameFor(contacts, record.ownerAddress)} made you a guardian`,
      body: 'You hold one part of the key to a letter. You release it only if they stop checking in.',
      to: '/legacy/silent',
      action: 'Open “If I go silent”',
      atMs: record.receivedAtMs,
    })
    const status = guardStatus(record, nowMs)
    if (status === 'overdue' || status === 'releasing')
      out.push({
        id: `guardian-due:${record.bundleIdHex}:${String(record.lastCounter)}`,
        kind: 'guardian',
        title: `${nameFor(contacts, record.ownerAddress)} has not checked in`,
        body:
          status === 'overdue'
            ? 'Their check-in is late. You can send them a reminder.'
            : 'The grace period is over. You can release your part of the key to the heir.',
        to: '/legacy/silent',
        action: 'Open “If I go silent”',
        atMs: nowMs,
      })
  }

  for (const item of sources.heirs) {
    out.push({
      id: `heir:${item.bundleIdHex}`,
      kind: 'letter',
      title: 'A guarded letter was left for you',
      body: `It opens once ${String(item.threshold)} of its ${String(item.total)} guardians release their parts of the key.`,
      to: '/legacy/silent',
      action: 'Open “If I go silent”',
      atMs: item.receivedAtMs,
    })
    if (shareCount(item) >= item.threshold)
      out.push({
        id: `heir-ready:${item.bundleIdHex}`,
        kind: 'letter',
        title: 'A guarded letter can now be opened',
        body: 'Enough guardians have released their parts of the key.',
        to: '/legacy/silent',
        action: 'Open “If I go silent”',
        atMs: item.receivedAtMs,
      })
  }

  for (const message of sources.messages)
    if (!message.belowMinimum)
      out.push({
        id: `message:${message.id}`,
        kind: 'message',
        title: 'An anonymous message arrived',
        body: `Someone paid ${formatZec(message.amountZat)} ZEC to reach you through your Unsigned card.`,
        to: '/unsigned',
        action: 'Open Unsigned',
        atMs: message.receivedAtMs,
      })

  return out.sort((a, b) => b.atMs - a.atMs)
}

interface SeenState {
  seen: string[]
  markSeen: (ids: readonly string[]) => void
  setAll: (seen: string[]) => void
}

/** Which notifications this person has read. Kept in the vault with the rest of their data. */
export const useNotificationsSeen = create<SeenState>()((set) => ({
  seen: [],
  markSeen: (ids) => {
    set((state) => {
      const fresh = ids.filter((id) => !state.seen.includes(id))
      return fresh.length === 0 ? state : { seen: [...state.seen, ...fresh] }
    })
  },
  setAll: (seen) => {
    set({ seen })
  },
}))
