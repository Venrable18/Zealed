import { MEMO_BYTES } from '../config/constants'
import {
  CHUNK_PAYLOAD_MAX,
  HEADER_BYTES,
  MAX_CHUNKS,
  MESSAGE_ID_BYTES,
  MESSAGE_TYPES,
  ZIP302_ARBITRARY_DATA,
  ZMP_MAGIC,
  ZMP_VERSION,
  type MessageType,
  type ZmpChunk,
} from './types'

const OFFSET_MAGIC = 1
const OFFSET_VERSION = 4
const OFFSET_TYPE = 5
const OFFSET_ID = 6
const OFFSET_INDEX = OFFSET_ID + MESSAGE_ID_BYTES
const OFFSET_COUNT = OFFSET_INDEX + 1
const OFFSET_LENGTH = OFFSET_COUNT + 1

const TYPE_BY_CODE = new Map<number, MessageType>(
  (Object.entries(MESSAGE_TYPES) as [MessageType, number][]).map(([name, code]) => [code, name]),
)

export type MalformedReason =
  | 'bad-length'
  | 'unsupported-version'
  | 'unknown-type'
  | 'bad-chunk-numbering'
  | 'bad-payload-length'
  | 'nonzero-padding'

export type DecodeResult =
  | { kind: 'chunk'; chunk: ZmpChunk }
  /** Not a ZMP memo: text, empty, another app's data. Callers ignore these. */
  | { kind: 'not-zmp' }
  /** Starts like ZMP but breaks the format. Callers drop these. */
  | { kind: 'malformed'; reason: MalformedReason }

/**
 * Builds one 512-byte memo. Throws RangeError on an invalid chunk, because chunks are built by
 * our own code and a bad one is a bug. Use decodeMemo for untrusted input.
 */
export function encodeChunk(chunk: ZmpChunk): Uint8Array {
  if (chunk.messageId.length !== MESSAGE_ID_BYTES) {
    throw new RangeError(`message ID must be ${String(MESSAGE_ID_BYTES)} bytes`)
  }
  if (!Number.isInteger(chunk.count) || chunk.count < 1 || chunk.count > MAX_CHUNKS) {
    throw new RangeError(`chunk count must be 1 to ${String(MAX_CHUNKS)}`)
  }
  if (!Number.isInteger(chunk.index) || chunk.index < 0 || chunk.index >= chunk.count) {
    throw new RangeError('chunk index must be below the chunk count')
  }
  if (chunk.payload.length > CHUNK_PAYLOAD_MAX) {
    throw new RangeError(`chunk payload is at most ${String(CHUNK_PAYLOAD_MAX)} bytes`)
  }

  const memo = new Uint8Array(MEMO_BYTES)
  memo[0] = ZIP302_ARBITRARY_DATA
  memo.set(ZMP_MAGIC, OFFSET_MAGIC)
  memo[OFFSET_VERSION] = ZMP_VERSION
  memo[OFFSET_TYPE] = MESSAGE_TYPES[chunk.type]
  memo.set(chunk.messageId, OFFSET_ID)
  memo[OFFSET_INDEX] = chunk.index
  memo[OFFSET_COUNT] = chunk.count
  memo[OFFSET_LENGTH] = chunk.payload.length >> 8
  memo[OFFSET_LENGTH + 1] = chunk.payload.length & 0xff
  memo.set(chunk.payload, HEADER_BYTES)
  return memo
}

/**
 * Reads one memo. Never throws and never reads outside the memo, whatever the bytes are.
 * Decoding is strict: anything that encodeChunk would not produce is rejected, so every chunk
 * has exactly one valid encoding.
 */
export function decodeMemo(memo: Uint8Array): DecodeResult {
  if (memo.length < OFFSET_VERSION || memo[0] !== ZIP302_ARBITRARY_DATA) return { kind: 'not-zmp' }
  for (let i = 0; i < ZMP_MAGIC.length; i++) {
    if (memo[OFFSET_MAGIC + i] !== ZMP_MAGIC[i]) return { kind: 'not-zmp' }
  }
  if (memo.length !== MEMO_BYTES) return { kind: 'malformed', reason: 'bad-length' }
  if (memo[OFFSET_VERSION] !== ZMP_VERSION)
    return { kind: 'malformed', reason: 'unsupported-version' }

  const type = TYPE_BY_CODE.get(memo[OFFSET_TYPE] ?? 0)
  if (type === undefined) return { kind: 'malformed', reason: 'unknown-type' }

  const index = memo[OFFSET_INDEX] ?? 0
  const count = memo[OFFSET_COUNT] ?? 0
  if (count < 1 || count > MAX_CHUNKS || index >= count) {
    return { kind: 'malformed', reason: 'bad-chunk-numbering' }
  }

  const length = ((memo[OFFSET_LENGTH] ?? 0) << 8) | (memo[OFFSET_LENGTH + 1] ?? 0)
  if (length > CHUNK_PAYLOAD_MAX) return { kind: 'malformed', reason: 'bad-payload-length' }

  for (let i = HEADER_BYTES + length; i < MEMO_BYTES; i++) {
    if (memo[i] !== 0) return { kind: 'malformed', reason: 'nonzero-padding' }
  }

  return {
    kind: 'chunk',
    chunk: {
      type,
      messageId: memo.slice(OFFSET_ID, OFFSET_ID + MESSAGE_ID_BYTES),
      index,
      count,
      payload: memo.slice(HEADER_BYTES, HEADER_BYTES + length),
    },
  }
}
