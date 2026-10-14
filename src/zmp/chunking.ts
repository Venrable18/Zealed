import {
  CHUNK_PAYLOAD_MAX,
  MAX_MESSAGE_BYTES,
  MESSAGE_ID_BYTES,
  type MessageType,
  type ZmpChunk,
} from './types'

/** A fresh random message ID. Collisions are negligible at 128 bits. */
export function newMessageId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(MESSAGE_ID_BYTES))
}

/**
 * Splits a payload into chunks that each fit one memo. An empty payload still produces one
 * chunk, so the message exists on the wire. Throws RangeError if the payload is too large.
 */
export function splitMessage(
  type: MessageType,
  payload: Uint8Array,
  messageId: Uint8Array = newMessageId(),
): ZmpChunk[] {
  if (payload.length > MAX_MESSAGE_BYTES) {
    throw new RangeError(`message payload is at most ${String(MAX_MESSAGE_BYTES)} bytes`)
  }
  const count = Math.max(1, Math.ceil(payload.length / CHUNK_PAYLOAD_MAX))
  const chunks: ZmpChunk[] = []
  for (let index = 0; index < count; index++) {
    chunks.push({
      type,
      messageId,
      index,
      count,
      payload: payload.slice(index * CHUNK_PAYLOAD_MAX, (index + 1) * CHUNK_PAYLOAD_MAX),
    })
  }
  return chunks
}
