/** A letter the person is sealing for someone else. */
export interface SealInput {
  /** The recipient's Zcash address. */
  recipient: string
  letter: string
  /** Zatoshis to include as a gift, or null for a letter only. */
  amountZat: bigint | null
  /** Unix ms. The letter cannot be opened before this. */
  unlockMs: number
}

export type SealField = 'recipient' | 'letter' | 'amount' | 'unlock'

/** One thing the sender sealed. Only "sent" is knowable: whether it was opened is not. */
export interface SentItem {
  id: string
  bundleIdHex: string
  recipient: string
  unlockMs: number
  createdAtMs: number
  amountZat: bigint | null
  status: 'sent' | 'failed'
  /** Kept only while delivery has failed, so it can be retried. */
  memos?: Uint8Array[]
  /** Kept only while delivery has failed, so the funds can be recovered. Sensitive. */
  giftSeed?: string
}

/** A sealed letter that arrived for this wallet. */
export interface InboxItem {
  bundleIdHex: string
  bundle: Uint8Array
  /** Unix ms of the drand round it opens at. */
  unlockMs: number
  receivedAtMs: number
  /** When the person opened it. Set once; the letter is then "unlocked". */
  openedAtMs?: number
  /** Whether the letter came with a gift, known once it has been opened. */
  hasGift?: boolean
  /** When the gift was moved into the wallet. */
  claimedAtMs?: number
}

/** Where a letter in the inbox is: waiting for its date, ready to open, or opened and done with. */
export type LetterStage = 'locked' | 'ready' | 'unlocked'

/**
 * "Unlocked" means opened, and any gift moved into the wallet. A letter that is opened but whose
 * gift is still waiting stays "ready", because it still has something to do.
 */
export function letterStage(item: InboxItem, nowMs: number): LetterStage {
  if (item.openedAtMs !== undefined && (item.hasGift !== true || item.claimedAtMs !== undefined))
    return 'unlocked'
  return item.unlockMs <= nowMs ? 'ready' : 'locked'
}
