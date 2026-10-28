import type { Pot, PrivacyStrength, HostView } from '../blindpot/types.ts'
import { letterStage } from '../legacy/types.ts'
import type { InboxItem, SentItem } from '../legacy/types.ts'
import { guardStatus, type GuardianRecord } from '../legacy/silent/guardian.ts'
import { shareCount, type HeirItem } from '../legacy/silent/heir.ts'
import { nextDueMs, type OwnerRecord } from '../legacy/silent/owner.ts'
import type { Card } from '../unsigned/card.ts'
import { summarize, type UnsignedMessage } from '../unsigned/inbox.ts'
import type { SentMessage } from '../unsigned/send.ts'

/** Everything the dashboard is computed from. All of it is already on this device. */
export interface DashboardInput {
  nowMs: number
  /** `null` when the wallet is not available. */
  balance: { spendableZat: bigint; pendingZat: bigint } | null
  pots: readonly Pot[]
  /** Host views by pot ID: totals as of the last batch boundary, never per payment. */
  potViews: Readonly<Record<string, HostView>>
  legacySent: readonly SentItem[]
  legacyInbox: readonly InboxItem[]
  owned: readonly OwnerRecord[]
  guardians: readonly GuardianRecord[]
  heirs: readonly HeirItem[]
  card: Card | null
  messages: readonly UnsignedMessage[]
  sentMessages: readonly SentMessage[]
}

export interface PotLine {
  id: string
  name: string
  cover: string
  closed: boolean
  /** Total as of the last batch, or null if it could not be read. */
  totalZat: bigint | null
  strength: PrivacyStrength | null
}

export interface DashboardStats {
  wallet: { spendableZat: bigint; pendingZat: bigint } | null
  pots: {
    count: number
    open: number
    closed: number
    /** Sum of the pots whose totals could be read. */
    totalZat: bigint
    /** How many pots have a total in the sum. */
    counted: number
    lines: PotLine[]
  }
  legacy: {
    sent: number
    notDelivered: number
    sealedForYou: { total: number; ready: number; locked: number; unlocked: number }
    silent: {
      active: number
      revoked: number
      nextCheckInMs: number | null
      overdue: boolean
      pendingSends: number
    }
    guarding: {
      total: number
      ok: number
      overdue: number
      releasing: number
      released: number
      revoked: number
    }
    waitingForYou: { total: number; ready: number }
  }
  unsigned: {
    hasCard: boolean
    received: number
    belowMinimum: number
    earnedZat: bigint
    sent: number
  }
}

/**
 * Works out every number on the dashboard. A pure function of data already on the device: it reads
 * nothing else, and never the network. Pot totals come only from batch-boundary views, so they
 * cannot reveal individual gifts.
 */
export function computeDashboard(input: DashboardInput): DashboardStats {
  const lines = input.pots.map((pot): PotLine => {
    const view = input.potViews[pot.id]
    return {
      id: pot.id,
      name: pot.name,
      cover: pot.cover,
      closed: pot.closed,
      totalZat: view?.totalZat ?? null,
      strength: view?.strength ?? null,
    }
  })
  const counted = lines.filter((line) => line.totalZat !== null)

  const active = input.owned.filter((record) => !record.revoked)
  const dues = active.map(nextDueMs)
  const nextCheckInMs = dues.length === 0 ? null : Math.min(...dues)

  const guardStatuses = input.guardians.map((record) => guardStatus(record, input.nowMs))
  const count = (status: string) => guardStatuses.filter((s) => s === status).length
  const earnings = summarize(input.messages)

  return {
    wallet: input.balance,
    pots: {
      count: input.pots.length,
      open: input.pots.filter((pot) => !pot.closed).length,
      closed: input.pots.filter((pot) => pot.closed).length,
      totalZat: counted.reduce((sum, line) => sum + (line.totalZat ?? 0n), 0n),
      counted: counted.length,
      lines,
    },
    legacy: {
      sent: input.legacySent.filter((item) => item.status === 'sent').length,
      notDelivered: input.legacySent.filter((item) => item.status === 'failed').length,
      sealedForYou: {
        total: input.legacyInbox.length,
        ready: input.legacyInbox.filter((item) => letterStage(item, input.nowMs) === 'ready')
          .length,
        locked: input.legacyInbox.filter((item) => letterStage(item, input.nowMs) === 'locked')
          .length,
        unlocked: input.legacyInbox.filter((item) => letterStage(item, input.nowMs) === 'unlocked')
          .length,
      },
      silent: {
        active: active.length,
        revoked: input.owned.length - active.length,
        nextCheckInMs,
        overdue: nextCheckInMs !== null && nextCheckInMs <= input.nowMs,
        pendingSends: input.owned.reduce((sum, record) => sum + record.pending.length, 0),
      },
      guarding: {
        total: input.guardians.length,
        ok: count('ok'),
        overdue: count('overdue'),
        releasing: count('releasing'),
        released: count('released'),
        revoked: count('revoked'),
      },
      waitingForYou: {
        total: input.heirs.length,
        ready: input.heirs.filter((item) => shareCount(item) >= item.threshold).length,
      },
    },
    unsigned: {
      hasCard: input.card !== null,
      received: earnings.messages,
      belowMinimum: earnings.belowMinimum,
      earnedZat: earnings.totalZat,
      sent: input.sentMessages.length,
    },
  }
}
