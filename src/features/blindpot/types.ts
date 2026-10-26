export interface Pot {
  /** 32 hex characters, random. Part of the share link; carries no personal data. */
  id: string
  name: string
  /** One emoji, or empty. */
  cover: string
  /** "YYYY-MM-DD" */
  eventDate: string
  /** "YYYY-MM-DD". Contributions close after this day. */
  endDate: string
  /** How often the host's total refreshes. Fixed when the pot is created. */
  batchIntervalMs: number
  /** Unix ms. Batch boundaries are counted from here. */
  createdAtMs: number
  /** The wallet account dedicated to this pot. */
  accountId: string
  /** The pot's receiving address (unified, shielded). */
  address: string
  closed: boolean
  /** Set for a pot co-hosted with FROST: withdrawals need co-hosts' approval. The shared pot's id. */
  sharedId?: string
}

/** Everything the host screen may show. There is deliberately no per-payment field. */
export interface HostView {
  totalZat: bigint
  strength: PrivacyStrength
  /** Wish texts only: shuffled, no times, no amounts. */
  wishes: string[]
  /** Unix ms of the last batch boundary the total is as of. */
  asOfMs: number
  /** Unix ms when the total next refreshes. */
  nextUpdateMs: number
}

export type PrivacyStrength = 'none' | 'weak' | 'medium' | 'strong'
