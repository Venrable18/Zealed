import { MEMO_BYTES } from '../config/constants'

/**
 * Zealed Memo Protocol (ZMP) wire format. One chunk fills exactly one 512-byte memo:
 *
 *   offset  size  field
 *   0       1     ZIP 302 arbitrary-data marker (0xFF)
 *   1       3     magic "ZLD"
 *   4       1     version
 *   5       1     message type
 *   6       16    message ID (random, shared by every chunk of a message)
 *   22      1     chunk index (0-based)
 *   23      1     chunk count
 *   24      2     payload length in bytes (big-endian)
 *   26      n     payload
 *   26+n    ...   zero padding to 512 bytes
 *
 * The payload length is not in the original plan. Without it, a payload that ends in zero
 * bytes cannot be told apart from padding.
 */

/** ZIP 302: first memo byte 0xFF marks arbitrary data, with the other 511 bytes unconstrained. */
export const ZIP302_ARBITRARY_DATA = 0xff

export const ZMP_MAGIC = [0x5a, 0x4c, 0x44] as const // "ZLD"
export const ZMP_VERSION = 1
export const MESSAGE_ID_BYTES = 16
export const HEADER_BYTES = 26

/** Largest payload one memo can carry. */
export const CHUNK_PAYLOAD_MAX = MEMO_BYTES - HEADER_BYTES

/** A message is split into at most this many chunks (one byte on the wire allows 255). */
export const MAX_CHUNKS = 16
export const MAX_MESSAGE_BYTES = MAX_CHUNKS * CHUNK_PAYLOAD_MAX

export const MESSAGE_TYPES = {
  WISH: 1,
  SEALED_BUNDLE: 2,
  SHARE: 3,
  SHARE_RELEASE: 4,
  CHECKIN: 5,
  REVOKE: 6,
  NUDGE: 7,
  UNSIGNED_MSG: 8,
} as const

export type MessageType = keyof typeof MESSAGE_TYPES

export interface ZmpChunk {
  type: MessageType
  messageId: Uint8Array
  /** 0-based position of this chunk. */
  index: number
  /** Total chunks in the message, 1 to MAX_CHUNKS. */
  count: number
  payload: Uint8Array
}

/** A fully reassembled message. */
export interface ZmpMessage {
  type: MessageType
  messageId: Uint8Array
  payload: Uint8Array
}
