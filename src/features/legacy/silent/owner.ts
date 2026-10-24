import { giftContent } from '../seal.ts'
import { LEGACY_LETTER_MAX_BYTES } from '../../../config/constants.ts'
import { sealForGuardians } from '../../../crypto/bundle.ts'
import { toHex } from '../../../crypto/bytes.ts'
import { signCheckIn, signRevoke } from '../../../crypto/sign.ts'
import { createInbox } from '../../../zmp/index.ts'
import { MIN_GIFT_ZAT, looksLikeAddress } from '../validate.ts'
import type { LegacyWalletPort } from '../walletPort.ts'
import { decodeNudge, encodeShareMessage, toMemos } from './messages.ts'

export const MIN_PERIOD_MS = 30_000
export const MIN_GRACE_MS = 10_000
export const MAX_PERIOD_MS = 5 * 365 * 24 * 60 * 60 * 1000
export const GUARDIANS_LIMITS = { min: 2, max: 5 } as const

export interface SilentInput {
  heirAddress: string
  guardianAddresses: string[]
  threshold: number
  /** Time between check-ins before guardians raise an alert. */
  periodMs: number
  /** Extra time after that before shares are released. */
  graceMs: number
  letter: string
  amountZat: bigint | null
}

export type SilentField =
  'heir' | 'guardians' | 'threshold' | 'period' | 'grace' | 'letter' | 'amount'

export type SilentValidation =
  { ok: true; value: SilentInput } | { ok: false; errors: Partial<Record<SilentField, string>> }

export function validateSilent(input: SilentInput): SilentValidation {
  const errors: Partial<Record<SilentField, string>> = {}
  const heir = input.heirAddress.trim()
  const guardians = input.guardianAddresses.map((address) => address.trim())
  const letter = input.letter.trim()

  if (heir === '') errors.heir = 'Enter the heir’s Zealed address.'
  else if (!looksLikeAddress(heir)) errors.heir = 'That does not look like a Zcash address.'

  if (guardians.length < GUARDIANS_LIMITS.min || guardians.length > GUARDIANS_LIMITS.max) {
    errors.guardians = `Choose ${String(GUARDIANS_LIMITS.min)} to ${String(GUARDIANS_LIMITS.max)} guardians.`
  } else if (guardians.some((address) => !looksLikeAddress(address))) {
    errors.guardians = 'Every guardian needs a valid Zcash address.'
  } else if (new Set(guardians).size !== guardians.length) {
    errors.guardians = 'Each guardian must be a different person.'
  } else if (guardians.includes(heir)) {
    errors.guardians = 'The heir cannot also be a guardian: they could open the letter alone.'
  }

  if (
    !Number.isInteger(input.threshold) ||
    input.threshold < 2 ||
    input.threshold > guardians.length
  ) {
    errors.threshold = 'Choose how many guardians are needed, from 2 up to the number of guardians.'
  }
  if (
    !Number.isFinite(input.periodMs) ||
    input.periodMs < MIN_PERIOD_MS ||
    input.periodMs > MAX_PERIOD_MS
  ) {
    errors.period = 'Choose a check-in period from 30 seconds to 5 years.'
  }
  if (
    !Number.isFinite(input.graceMs) ||
    input.graceMs < MIN_GRACE_MS ||
    input.graceMs > MAX_PERIOD_MS
  ) {
    errors.grace = 'Choose a grace period from 10 seconds to 5 years.'
  }

  const letterBytes = new TextEncoder().encode(letter).length
  if (letter === '') errors.letter = 'Write something to seal.'
  else if (letterBytes > LEGACY_LETTER_MAX_BYTES) {
    errors.letter = `A letter can be up to ${String(LEGACY_LETTER_MAX_BYTES)} bytes. This one is ${String(letterBytes)}.`
  }
  if (input.amountZat !== null && input.amountZat < MIN_GIFT_ZAT)
    errors.amount = 'The smallest gift is 0.001 ZEC.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { ...input, heirAddress: heir, guardianAddresses: guardians, letter },
  }
}

/** A send that has not gone through yet. Kept so it can be retried. */
export interface PendingSend {
  to: string
  memos: Uint8Array[]
}

/** The owner's side of one Mode B letter. Holds the check-in private key: a secret. */
export interface OwnerRecord {
  bundleIdHex: string
  heirAddress: string
  guardianAddresses: string[]
  threshold: number
  periodMs: number
  graceMs: number
  createdAtMs: number
  /** Last check-in counter used. */
  counter: number
  lastCheckInMs: number
  /** The check-in private key. Must be kept only in encrypted storage; never log or send it. */
  privateKey: Uint8Array
  amountZat: bigint | null
  pending: PendingSend[]
  /** Kept only until everything is delivered, so funds can be recovered if delivery fails. */
  giftSeed?: string
  revoked: boolean
  /** IDs of reminders already counted, so a rescan does not count them again. */
  nudgeIds: string[]
}

export function nextDueMs(record: OwnerRecord): number {
  return record.lastCheckInMs + record.periodMs
}

/** Sends pending items in order, stopping at the first failure. */
export async function runPending(
  wallet: LegacyWalletPort,
  record: OwnerRecord,
): Promise<{ record: OwnerRecord; ok: boolean }> {
  let current = record
  while (current.pending.length > 0) {
    const [next, ...rest] = current.pending
    if (next === undefined) break
    try {
      await wallet.sendMemos({ to: next.to, memos: next.memos })
    } catch {
      return { record: current, ok: false }
    }
    current = { ...current, pending: rest }
  }
  if (current.giftSeed !== undefined) {
    // Everything was delivered, so the recovery copy of the gift seed is no longer needed.
    current = { ...current }
    delete current.giftSeed
  }
  return { record: current, ok: true }
}

export type SetupResult =
  | { ok: true; record: OwnerRecord }
  | { ok: false; reason: 'invalid'; errors: Partial<Record<SilentField, string>> }
  | { ok: false; reason: 'wallet-unavailable' }
  | { ok: false; reason: 'seal-failed' }
  | { ok: false; reason: 'funding-failed' }
  /** Funded, but some sends failed. `record` keeps what is left to send. */
  | { ok: false; reason: 'delivery-failed'; record: OwnerRecord }

/**
 * Seals a letter for guardians and sends everything: the sealed letter to the heir, and to each
 * guardian their share, the policy, where to send reminders, and a first check-in (so every
 * guardian's clock starts now). The gift, if any, is funded first.
 */
export async function setupSilentLetter(
  wallet: LegacyWalletPort | null,
  input: SilentInput,
  options: { nowMs: number },
): Promise<SetupResult> {
  const checked = validateSilent(input)
  if (!checked.ok) return { ok: false, reason: 'invalid', errors: checked.errors }
  if (wallet === null) return { ok: false, reason: 'wallet-unavailable' }
  const value = checked.value

  let gift: { seed: string; address: string; birthday?: number } | undefined
  let sealed
  let ownerAddress: string
  try {
    ownerAddress = await wallet.ownAddress()
    gift = value.amountZat === null ? undefined : await wallet.createGiftWallet()
    sealed = await sealForGuardians({
      content: { letter: value.letter, ...giftContent(gift) },
      heirAddress: value.heirAddress,
      total: value.guardianAddresses.length,
      threshold: value.threshold,
      periodMs: value.periodMs,
      graceMs: value.graceMs,
      nowMs: options.nowMs,
    })
  } catch {
    return { ok: false, reason: 'seal-failed' }
  }

  const firstCheckIn = signCheckIn(sealed.ownerKey.privateKey, {
    bundleId: sealed.bundleId,
    counter: 1,
    timestampMs: options.nowMs,
  })
  const pending: PendingSend[] = [
    { to: value.heirAddress, memos: toMemos('SEALED_BUNDLE', sealed.bundle) },
    ...value.guardianAddresses.map((to, index): PendingSend => ({
      to,
      memos: [
        ...toMemos(
          'SHARE',
          encodeShareMessage({
            policy: sealed.policy,
            share: sealed.shares[index] ?? new Uint8Array(),
            ownerAddress,
          }),
        ),
        ...toMemos('CHECKIN', firstCheckIn),
      ],
    })),
  ]

  if (gift !== undefined && value.amountZat !== null) {
    try {
      await wallet.fundGiftWallet(gift.address, value.amountZat)
    } catch {
      return { ok: false, reason: 'funding-failed' }
    }
  }

  const record: OwnerRecord = {
    bundleIdHex: toHex(sealed.bundleId),
    heirAddress: value.heirAddress,
    guardianAddresses: value.guardianAddresses,
    threshold: value.threshold,
    periodMs: value.periodMs,
    graceMs: value.graceMs,
    createdAtMs: options.nowMs,
    counter: 1,
    lastCheckInMs: options.nowMs,
    privateKey: sealed.ownerKey.privateKey,
    amountZat: value.amountZat,
    pending,
    ...(gift === undefined ? {} : { giftSeed: gift.seed }),
    revoked: false,
    nudgeIds: [],
  }
  const sent = await runPending(wallet, record)
  return sent.ok
    ? { ok: true, record: sent.record }
    : { ok: false, reason: 'delivery-failed', record: sent.record }
}

/** One tap: a fresh signed check-in to every guardian. The counter is spent even if a send fails. */
export async function ownerCheckIn(
  wallet: LegacyWalletPort,
  record: OwnerRecord,
  nowMs: number,
): Promise<{ record: OwnerRecord; ok: boolean }> {
  if (record.revoked) return { record, ok: false }
  const counter = record.counter + 1
  const bundleId = hexToBytes(record.bundleIdHex)
  const signed = signCheckIn(record.privateKey, { bundleId, counter, timestampMs: nowMs })
  const memos = toMemos('CHECKIN', signed)
  return runPending(wallet, {
    ...record,
    counter,
    lastCheckInMs: nowMs,
    pending: [...record.pending, ...record.guardianAddresses.map((to) => ({ to, memos }))],
  })
}

/** Tells every guardian to discard its share. After this the heir can never open the letter. */
export async function ownerRevoke(
  wallet: LegacyWalletPort,
  record: OwnerRecord,
  nowMs: number,
): Promise<{ record: OwnerRecord; ok: boolean }> {
  const signed = signRevoke(record.privateKey, {
    bundleId: hexToBytes(record.bundleIdHex),
    timestampMs: nowMs,
  })
  const memos = toMemos('REVOKE', signed)
  return runPending(wallet, {
    ...record,
    revoked: true,
    pending: [...record.pending, ...record.guardianAddresses.map((to) => ({ to, memos }))],
  })
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

/** Counts reminders from guardians. Each is counted once, however often the memos are rescanned. */
export async function ingestForOwner(
  records: readonly OwnerRecord[],
  memos: Uint8Array[],
): Promise<OwnerRecord[]> {
  const nudges: { bundleIdHex: string; id: string }[] = []
  const inbox = createInbox({
    NUDGE: (message) => {
      const bundleId = decodeNudge(message.payload)
      if (bundleId !== null)
        nudges.push({ bundleIdHex: toHex(bundleId), id: toHex(message.messageId) })
    },
  })
  for (const memo of memos) await inbox.ingest(memo)
  return records.map((record) => {
    const fresh = nudges.filter(
      (n) => n.bundleIdHex === record.bundleIdHex && !record.nudgeIds.includes(n.id),
    )
    return fresh.length === 0
      ? record
      : { ...record, nudgeIds: [...record.nudgeIds, ...fresh.map((n) => n.id)] }
  })
}
