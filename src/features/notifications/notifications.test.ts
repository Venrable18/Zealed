import { beforeEach, describe, expect, it } from 'vitest'
import type { SharedPot, Withdrawal } from '../blindpot/shared/types.ts'
import type { InboxItem } from '../legacy/types.ts'
import type { UnsignedMessage } from '../unsigned/inbox.ts'
import {
  collectNotifications,
  useNotificationsSeen,
  type NotificationSources,
} from './notifications.ts'

const HOST = 'utest1hostaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
const NOW = 1_800_000_000_000

function pot(overrides: Partial<SharedPot>): SharedPot {
  return {
    id: 'p1',
    name: 'Ada’s wedding',
    role: 'cohost',
    me: 2,
    threshold: 2,
    members: [
      { index: 1, address: HOST },
      { index: 2, address: 'utest1me' },
      { index: 3, address: 'utest1other' },
    ],
    viewingSeed: '00',
    status: 'invited',
    declinedBy: [],
    round1: {},
    round2: {},
    withdrawals: [],
    createdAtMs: NOW - 1000,
    ...overrides,
  }
}

function sources(overrides: Partial<NotificationSources>): NotificationSources {
  return {
    sharedPots: [],
    letters: [],
    messages: [],
    guardians: [],
    heirs: [],
    contacts: [],
    ...overrides,
  }
}

describe('collectNotifications', () => {
  it('tells a co-host about an invitation and sends them to Blind Pot to answer it', () => {
    const [n] = collectNotifications(
      sources({ sharedPots: [pot({})], contacts: [{ id: 'c', name: 'Ada', address: HOST }] }),
      NOW,
    )
    expect(n).toMatchObject({ id: 'cohost:p1', kind: 'cohost', to: '/blind-pot' })
    expect(n?.title).toBe('Ada invites you to co-host “Ada’s wedding”')
    expect(n?.body).toContain('accept or decline')
  })

  it('stops showing the invitation once it is answered', () => {
    const list = collectNotifications(sources({ sharedPots: [pot({ status: 'keygen' })] }), NOW)
    expect(list).toEqual([])
  })

  it('asks a co-host to review a pending withdrawal, and only a pending one', () => {
    const w = (id: string, status: Withdrawal['status']) =>
      ({ id, status, createdAtMs: NOW }) as Withdrawal
    const list = collectNotifications(
      sources({
        sharedPots: [
          pot({ status: 'ready', withdrawals: [w('w1', 'pending'), w('w2', 'approved')] }),
        ],
      }),
      NOW,
    )
    expect(list.map((n) => n.id)).toEqual(['withdrawal:w1'])
  })

  it('tells the host when the shared pot is ready', () => {
    const list = collectNotifications(
      sources({ sharedPots: [pot({ role: 'host', me: 1, status: 'ready' })] }),
      NOW,
    )
    expect(list.map((n) => n.id)).toEqual(['pot-ready:p1'])
  })

  it('announces a letter, and again once it can be opened', () => {
    const letter = {
      bundleIdHex: 'ab',
      unlockMs: NOW + 60_000,
      receivedAtMs: NOW - 5000,
    } as InboxItem
    expect(collectNotifications(sources({ letters: [letter] }), NOW).map((n) => n.id)).toEqual([
      'letter:ab',
    ])
    expect(
      collectNotifications(sources({ letters: [letter] }), NOW + 120_000).map((n) => n.id),
    ).toEqual(['letter-ready:ab', 'letter:ab'])
  })

  it('announces paid anonymous messages but not ones below the minimum', () => {
    const message = (id: string, belowMinimum: boolean) =>
      ({ id, belowMinimum, amountZat: 10_000n, receivedAtMs: NOW }) as UnsignedMessage
    const list = collectNotifications(
      sources({ messages: [message('m1', false), message('m2', true)] }),
      NOW,
    )
    expect(list.map((n) => n.id)).toEqual(['message:m1'])
  })

  it('lists the newest first', () => {
    const list = collectNotifications(
      sources({
        sharedPots: [pot({ createdAtMs: NOW - 10 })],
        letters: [{ bundleIdHex: 'ab', unlockMs: NOW + 1, receivedAtMs: NOW - 5 } as InboxItem],
      }),
      NOW,
    )
    expect(list.map((n) => n.id)).toEqual(['letter:ab', 'cohost:p1'])
  })
})

describe('useNotificationsSeen', () => {
  beforeEach(() => {
    useNotificationsSeen.getState().setAll([])
  })

  it('remembers each read notification once', () => {
    useNotificationsSeen.getState().markSeen(['a', 'b'])
    useNotificationsSeen.getState().markSeen(['b', 'c'])
    expect(useNotificationsSeen.getState().seen).toEqual(['a', 'b', 'c'])
  })
})
