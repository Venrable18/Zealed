import type { MessageType, ZmpChunk, ZmpMessage } from './types'

export type AddResult =
  | { status: 'incomplete'; received: number; count: number }
  | { status: 'complete'; message: ZmpMessage }
  /** The same chunk arrived again (wallet rescans do this). Harmless. */
  | { status: 'duplicate' }
  /** A chunk of a message that was already delivered. */
  | { status: 'already-complete' }
  | { status: 'rejected'; reason: 'header-mismatch' | 'conflicting-duplicate' }

interface Pending {
  type: MessageType
  count: number
  chunks: (Uint8Array | undefined)[]
  received: number
}

export interface ReassemblerOptions {
  /** Partial messages kept at once. The oldest is dropped beyond this. */
  maxPending?: number
  /** Delivered message IDs remembered, to ignore repeats. */
  maxCompleted?: number
}

function toKey(id: Uint8Array): string {
  return Array.from(id, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i])
}

/**
 * Collects chunks by message ID and delivers each message once, whatever order the chunks
 * arrive in. Memory is bounded, so a flood of junk chunks cannot grow it without limit.
 *
 * Chunks are not authenticated here. Anyone can send a chunk for any message ID, so payloads
 * that matter are encrypted (AES-GCM) above this layer and fail to decrypt if tampered with.
 * Where chunks disagree, the first one received wins.
 */
export class Reassembler {
  private readonly pending = new Map<string, Pending>()
  private readonly completed = new Set<string>()
  private readonly maxPending: number
  private readonly maxCompleted: number

  constructor(options: ReassemblerOptions = {}) {
    this.maxPending = options.maxPending ?? 64
    this.maxCompleted = options.maxCompleted ?? 256
  }

  add(chunk: ZmpChunk): AddResult {
    const key = toKey(chunk.messageId)
    if (this.completed.has(key)) return { status: 'already-complete' }

    let entry = this.pending.get(key)
    if (entry === undefined) {
      if (this.pending.size >= this.maxPending) {
        const oldest = this.pending.keys().next()
        if (!oldest.done) this.pending.delete(oldest.value)
      }
      entry = {
        type: chunk.type,
        count: chunk.count,
        chunks: new Array<Uint8Array | undefined>(chunk.count),
        received: 0,
      }
      this.pending.set(key, entry)
    } else if (entry.type !== chunk.type || entry.count !== chunk.count) {
      return { status: 'rejected', reason: 'header-mismatch' }
    }

    const existing = entry.chunks[chunk.index]
    if (existing !== undefined) {
      return bytesEqual(existing, chunk.payload)
        ? { status: 'duplicate' }
        : { status: 'rejected', reason: 'conflicting-duplicate' }
    }

    entry.chunks[chunk.index] = chunk.payload.slice()
    entry.received++
    if (entry.received < entry.count) {
      return { status: 'incomplete', received: entry.received, count: entry.count }
    }

    const parts = entry.chunks as Uint8Array[]
    const payload = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
    let offset = 0
    for (const part of parts) {
      payload.set(part, offset)
      offset += part.length
    }

    this.pending.delete(key)
    this.completed.add(key)
    if (this.completed.size > this.maxCompleted) {
      const oldest = this.completed.values().next()
      if (!oldest.done) this.completed.delete(oldest.value)
    }
    return {
      status: 'complete',
      message: { type: entry.type, messageId: chunk.messageId.slice(), payload },
    }
  }
}
