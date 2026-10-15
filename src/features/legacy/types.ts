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
}
