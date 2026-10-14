import { decodeMemo, type MalformedReason } from './codec'
import { Reassembler } from './reassembler'
import type { MessageType, ZmpMessage } from './types'

export type MessageHandler = (message: ZmpMessage) => void | Promise<void>
export type MessageHandlers = Partial<Record<MessageType, MessageHandler>>

/** What happened to one memo. Contains no memo content, so it is safe to show or count. */
export type IngestOutcome =
  | { kind: 'ignored' }
  | { kind: 'malformed'; reason: MalformedReason }
  | { kind: 'partial'; received: number; count: number }
  | { kind: 'repeat' }
  | { kind: 'rejected'; reason: 'header-mismatch' | 'conflicting-duplicate' }
  | { kind: 'delivered'; type: MessageType }
  | { kind: 'unhandled'; type: MessageType }
  | { kind: 'handler-error'; type: MessageType }

/**
 * Feeds received memos through decoding and reassembly, and routes each complete message to the
 * handler for its type. Memos that are not ZMP are ignored. The wallet supplies raw memo
 * bytes, so this has no wallet dependency.
 */
export function createInbox(handlers: MessageHandlers, reassembler = new Reassembler()) {
  return {
    async ingest(memo: Uint8Array): Promise<IngestOutcome> {
      const decoded = decodeMemo(memo)
      if (decoded.kind === 'not-zmp') return { kind: 'ignored' }
      if (decoded.kind === 'malformed') return { kind: 'malformed', reason: decoded.reason }

      const added = reassembler.add(decoded.chunk)
      switch (added.status) {
        case 'incomplete':
          return { kind: 'partial', received: added.received, count: added.count }
        case 'duplicate':
        case 'already-complete':
          return { kind: 'repeat' }
        case 'rejected':
          return { kind: 'rejected', reason: added.reason }
        case 'complete': {
          const { message } = added
          const handler = handlers[message.type]
          if (handler === undefined) return { kind: 'unhandled', type: message.type }
          try {
            await handler(message)
          } catch {
            return { kind: 'handler-error', type: message.type }
          }
          return { kind: 'delivered', type: message.type }
        }
      }
    },
  }
}
