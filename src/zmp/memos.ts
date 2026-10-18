import { encodeChunk } from './codec.ts'
import { splitMessage } from './chunking.ts'
import type { MessageType } from './types.ts'

/** Splits one message into the 512-byte memos that carry it, ready to send. */
export function toMemos(type: MessageType, payload: Uint8Array): Uint8Array[] {
  return splitMessage(type, payload).map(encodeChunk)
}
