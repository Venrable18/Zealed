import { toHex } from '../../crypto/bytes.ts'
import { createInbox } from '../../zmp/index.ts'
import type { Card } from './card.ts'
import { decodeUnsigned } from './format.ts'
import type { ReceivedTx } from './walletPort.ts'

export interface UnsignedMessage {
  /** Stable across rescans: the transaction plus the message's own ID. */
  id: string
  txid: string
  /** Block time of the payment (Unix ms). */
  receivedAtMs: number
  /** What the sender paid with this message. Only the first message in a payment carries it. */
  amountZat: bigint
  body: string
  replyTo?: string
  commitment?: Uint8Array
  /** Paid less than the card's minimum: kept in a hidden folder. */
  belowMinimum: boolean
}

/**
 * Turns received payments into messages. Each payment pays for one message: if a payment carries
 * several, the first gets the amount and the rest count as unpaid, so stuffing many messages into
 * one minimum payment does not get them past the filter. Memos that are not Zealed messages, or
 * are malformed, are ignored. Newest first.
 */
export async function readInbox(
  txs: readonly ReceivedTx[],
  card: Pick<Card, 'minimumZat'>,
): Promise<UnsignedMessage[]> {
  const messages: UnsignedMessage[] = []
  for (const tx of txs) {
    const found: { messageId: string; payload: Uint8Array }[] = []
    const inbox = createInbox({
      UNSIGNED_MSG: (m) => void found.push({ messageId: toHex(m.messageId), payload: m.payload }),
    })
    for (const memo of tx.memos) await inbox.ingest(memo)

    let first = true
    for (const { messageId, payload } of found) {
      const decoded = decodeUnsigned(payload)
      if (decoded === null) continue
      const amountZat = first ? tx.amountZat : 0n
      first = false
      messages.push({
        id: `${tx.txid}:${messageId}`,
        txid: tx.txid,
        receivedAtMs: tx.receivedAtMs,
        amountZat,
        body: decoded.body,
        ...(decoded.replyTo === undefined ? {} : { replyTo: decoded.replyTo }),
        ...(decoded.commitment === undefined ? {} : { commitment: decoded.commitment }),
        belowMinimum: amountZat < card.minimumZat,
      })
    }
  }
  return messages.sort((a, b) => b.receivedAtMs - a.receivedAtMs)
}

export interface Earnings {
  /** Total paid through the card, counting every payment once. */
  totalZat: bigint
  /** Messages that met the minimum. */
  messages: number
  /** Messages in the hidden folder. */
  belowMinimum: number
  /** Value paid by messages in the hidden folder (included in the total). */
  belowMinimumZat: bigint
}

export function summarize(messages: readonly UnsignedMessage[]): Earnings {
  const below = messages.filter((m) => m.belowMinimum)
  return {
    totalZat: messages.reduce((sum, m) => sum + m.amountZat, 0n),
    messages: messages.length - below.length,
    belowMinimum: below.length,
    belowMinimumZat: below.reduce((sum, m) => sum + m.amountZat, 0n),
  }
}
