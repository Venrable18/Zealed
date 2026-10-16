import { bytesToU64, toHex } from '../../../crypto/bytes.ts'
import type { Policy } from '../../../crypto/bundle.ts'
import { BUNDLE_ID_BYTES, CheckInTracker, verifyRevoke } from '../../../crypto/sign.ts'
import { createInbox } from '../../../zmp/index.ts'
import { decodeShareMessage, encodeNudge, encodeRelease, toMemos } from './messages.ts'

/** What a guardian knows about one person they guard. */
export interface GuardianRecord {
  bundleIdHex: string
  policy: Policy
  /** The guardian's share. Wiped once released or revoked. */
  share: Uint8Array | undefined
  ownerAddress: string
  receivedAtMs: number
  /** Highest check-in counter accepted, or -1. Kept so replays stay refused across visits. */
  lastCounter: number
  /** When the owner stamped their latest valid check-in (never later than we saw it), or null. */
  lastCheckInMs: number | null
  released: boolean
  revoked: boolean
}

export type GuardStatus = 'ok' | 'overdue' | 'releasing' | 'released' | 'revoked'

/** The moment the owner is due: the last check-in, or when the share arrived if there has been none. */
function baseMs(record: GuardianRecord): number {
  return record.lastCheckInMs ?? record.receivedAtMs
}

export function dueMs(record: GuardianRecord): number {
  return baseMs(record) + record.policy.periodMs
}

/** When a share may be released: the check-in period plus the grace period after the last check-in. */
export function releaseMs(record: GuardianRecord): number {
  return dueMs(record) + record.policy.graceMs
}

export function guardStatus(record: GuardianRecord, nowMs: number): GuardStatus {
  if (record.revoked) return 'revoked'
  if (record.released) return 'released'
  if (nowMs < dueMs(record)) return 'ok'
  return nowMs < releaseMs(record) ? 'overdue' : 'releasing'
}

export type GuardianEvent =
  | { kind: 'new-share'; bundleIdHex: string }
  | { kind: 'check-in'; bundleIdHex: string }
  | { kind: 'rejected-check-in'; bundleIdHex: string | null; reason: string }
  | { kind: 'revoked'; bundleIdHex: string }

/**
 * Applies received memos to the guardian's records. Memos are collected first and applied in a
 * fixed order (shares, then check-ins by counter, then revokes), so the result does not depend on
 * the order the wallet returns them in, and a check-in that arrives before its share still counts
 * when the share is in the same batch. A record that is revoked or released ignores everything
 * after. Check-ins are verified against the owner's public key from the policy, so forged and
 * replayed ones are dropped.
 */
export async function ingestForGuardian(
  records: readonly GuardianRecord[],
  memos: Uint8Array[],
  nowMs: number,
): Promise<{ records: GuardianRecord[]; events: GuardianEvent[] }> {
  const shares: Uint8Array[] = []
  const checkIns: Uint8Array[] = []
  const revokes: Uint8Array[] = []
  const inbox = createInbox({
    SHARE: (m) => void shares.push(m.payload),
    CHECKIN: (m) => void checkIns.push(m.payload),
    REVOKE: (m) => void revokes.push(m.payload),
  })
  for (const memo of memos) await inbox.ingest(memo)

  const byId = new Map(records.map((record) => [record.bundleIdHex, { ...record }]))
  const events: GuardianEvent[] = []

  for (const payload of shares) {
    const message = decodeShareMessage(payload)
    if (message === null) continue
    const id = toHex(message.policy.bundleId)
    if (byId.has(id)) continue
    byId.set(id, {
      bundleIdHex: id,
      policy: message.policy,
      share: message.share,
      ownerAddress: message.ownerAddress,
      receivedAtMs: nowMs,
      lastCounter: -1,
      lastCheckInMs: null,
      released: false,
      revoked: false,
    })
    events.push({ kind: 'new-share', bundleIdHex: id })
  }

  // The bundle ID is the first 16 bytes of a check-in or revoke, readable before verifying.
  const idOf = (payload: Uint8Array) =>
    payload.length >= BUNDLE_ID_BYTES ? toHex(payload.slice(0, BUNDLE_ID_BYTES)) : null
  const counterOf = (payload: Uint8Array) => {
    try {
      return payload.length >= BUNDLE_ID_BYTES + 8
        ? bytesToU64(payload.slice(BUNDLE_ID_BYTES, BUNDLE_ID_BYTES + 8))
        : 0
    } catch {
      return 0
    }
  }

  for (const payload of [...checkIns].sort((a, b) => counterOf(a) - counterOf(b))) {
    const id = idOf(payload)
    const record = id === null ? undefined : byId.get(id)
    if (record === undefined) {
      events.push({ kind: 'rejected-check-in', bundleIdHex: id, reason: 'unknown-bundle' })
      continue
    }
    if (record.revoked || record.released) continue
    const tracker = new CheckInTracker(
      record.policy.checkInPublicKey,
      record.policy.bundleId,
      record.lastCounter < 0
        ? undefined
        : { counter: record.lastCounter, timestampMs: record.lastCheckInMs ?? 0 },
    )
    const result = tracker.accept(payload, nowMs)
    if (!result.ok) {
      events.push({ kind: 'rejected-check-in', bundleIdHex: id, reason: result.reason })
      continue
    }
    record.lastCounter = result.checkIn.counter
    record.lastCheckInMs = Math.min(result.checkIn.timestampMs, nowMs)
    events.push({ kind: 'check-in', bundleIdHex: record.bundleIdHex })
  }

  for (const payload of revokes) {
    const id = idOf(payload)
    const record = id === null ? undefined : byId.get(id)
    if (record === undefined || record.revoked || record.released) continue
    if (verifyRevoke(record.policy.checkInPublicKey, payload) === null) continue
    record.revoked = true
    record.share = undefined
    events.push({ kind: 'revoked', bundleIdHex: record.bundleIdHex })
  }

  return { records: [...byId.values()], events }
}

export interface GuardianAction {
  to: string
  memos: Uint8Array[]
}

/** A reminder to the owner. Only while the owner is overdue and nothing has been released. */
export function nudgeAction(record: GuardianRecord, nowMs: number): GuardianAction | null {
  const status = guardStatus(record, nowMs)
  if (status !== 'overdue' && status !== 'releasing') return null
  return { to: record.ownerAddress, memos: toMemos('NUDGE', encodeNudge(record.policy.bundleId)) }
}

/** The share to send to the heir. Only once the grace period has passed and nothing was released. */
export function releaseAction(record: GuardianRecord, nowMs: number): GuardianAction | null {
  if (guardStatus(record, nowMs) !== 'releasing' || record.share === undefined) return null
  return {
    to: record.policy.heirAddress,
    memos: toMemos(
      'SHARE_RELEASE',
      encodeRelease({ bundleId: record.policy.bundleId, share: record.share }),
    ),
  }
}

/** Marks a record released and wipes its share. Call after the release was sent. */
export function markReleased(record: GuardianRecord): GuardianRecord {
  return { ...record, released: true, share: undefined }
}
