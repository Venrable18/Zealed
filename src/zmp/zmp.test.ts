import { describe, expect, it } from 'vitest'
import { MEMO_BYTES } from '../config/constants'
import {
  CHUNK_PAYLOAD_MAX,
  HEADER_BYTES,
  MAX_CHUNKS,
  MAX_MESSAGE_BYTES,
  MESSAGE_TYPES,
  Reassembler,
  createInbox,
  decodeMemo,
  encodeChunk,
  newMessageId,
  splitMessage,
  type IngestOutcome,
  type MessageType,
  type ZmpMessage,
} from '.'

/** Deterministic PRNG so fuzz failures reproduce. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomBytes(random: () => number, length: number): Uint8Array {
  return Uint8Array.from({ length }, () => Math.floor(random() * 256))
}

function shuffled<T>(random: () => number, items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = copy[i] as T
    copy[i] = copy[j] as T
    copy[j] = a
  }
  return copy
}

/** Encodes, decodes and feeds every chunk to a reassembler; returns the completed message. */
function roundTrip(
  type: MessageType,
  payload: Uint8Array,
  order: (c: ReturnType<typeof splitMessage>) => ReturnType<typeof splitMessage>,
): ZmpMessage | undefined {
  const reassembler = new Reassembler()
  let result: ZmpMessage | undefined
  for (const chunk of order(splitMessage(type, payload))) {
    const decoded = decodeMemo(encodeChunk(chunk))
    if (decoded.kind !== 'chunk') throw new Error('expected a chunk')
    const added = reassembler.add(decoded.chunk)
    if (added.status === 'complete') result = added.message
  }
  return result
}

describe('wire format', () => {
  it('fills exactly one memo and uses the ZIP 302 arbitrary-data marker', () => {
    const memo = encodeChunk(splitMessage('WISH', new Uint8Array([1, 2, 3]))[0]!)
    expect(memo.length).toBe(MEMO_BYTES)
    expect(memo[0]).toBe(0xff)
    expect(Array.from(memo.slice(1, 4))).toEqual([0x5a, 0x4c, 0x44])
    expect(CHUNK_PAYLOAD_MAX).toBe(MEMO_BYTES - HEADER_BYTES)
  })

  it('has a distinct code for each of the sixteen message types', () => {
    const codes = Object.values(MESSAGE_TYPES)
    expect(codes).toHaveLength(16)
    expect(new Set(codes).size).toBe(16)
  })

  it('keeps trailing zero bytes in the payload', () => {
    const payload = new Uint8Array([7, 0, 0, 0])
    const [chunk] = splitMessage('CHECKIN', payload)
    const decoded = decodeMemo(encodeChunk(chunk!))
    expect(decoded.kind === 'chunk' && Array.from(decoded.chunk.payload)).toEqual([7, 0, 0, 0])
  })
})

describe('decodeMemo', () => {
  const valid = () => encodeChunk(splitMessage('NUDGE', new Uint8Array([9, 9]))[0]!)

  it('ignores memos that are not ZMP', () => {
    const text = new TextEncoder().encode('hello')
    expect(decodeMemo(text).kind).toBe('not-zmp')
    expect(decodeMemo(new Uint8Array(0)).kind).toBe('not-zmp')
    const empty = new Uint8Array(MEMO_BYTES)
    empty[0] = 0xf6
    expect(decodeMemo(empty).kind).toBe('not-zmp')
    const otherApp = new Uint8Array(MEMO_BYTES)
    otherApp[0] = 0xff
    expect(decodeMemo(otherApp).kind).toBe('not-zmp')
  })

  it.each([
    ['bad-length', (m: Uint8Array) => m.slice(0, 100)],
    ['unsupported-version', (m: Uint8Array) => Object.assign(m, { 4: 2 })],
    ['unknown-type', (m: Uint8Array) => Object.assign(m, { 5: 99 })],
    ['bad-chunk-numbering', (m: Uint8Array) => Object.assign(m, { 22: 5, 23: 2 })],
    ['bad-chunk-numbering', (m: Uint8Array) => Object.assign(m, { 23: 0 })],
    ['bad-chunk-numbering', (m: Uint8Array) => Object.assign(m, { 23: MAX_CHUNKS + 1 })],
    ['bad-payload-length', (m: Uint8Array) => Object.assign(m, { 24: 0xff, 25: 0xff })],
    ['nonzero-padding', (m: Uint8Array) => Object.assign(m, { 511: 1 })],
  ])('rejects %s', (reason, corrupt) => {
    expect(decodeMemo(corrupt(valid()))).toEqual({ kind: 'malformed', reason })
  })

  it('returns copies, so changing the memo later does not change the chunk', () => {
    const memo = valid()
    const decoded = decodeMemo(memo)
    memo.fill(0)
    expect(decoded.kind === 'chunk' && Array.from(decoded.chunk.payload)).toEqual([9, 9])
  })
})

describe('encodeChunk', () => {
  const base = splitMessage('WISH', new Uint8Array([1]))[0]!

  it('refuses invalid chunks', () => {
    expect(() => encodeChunk({ ...base, messageId: new Uint8Array(4) })).toThrow(RangeError)
    expect(() => encodeChunk({ ...base, count: 0 })).toThrow(RangeError)
    expect(() => encodeChunk({ ...base, index: 1 })).toThrow(RangeError)
    expect(() => encodeChunk({ ...base, payload: new Uint8Array(CHUNK_PAYLOAD_MAX + 1) })).toThrow(
      RangeError,
    )
  })
})

describe('splitMessage', () => {
  it('sends an empty payload as one chunk', () => {
    expect(splitMessage('REVOKE', new Uint8Array(0))).toHaveLength(1)
  })

  it('uses full chunks and no more than needed', () => {
    const chunks = splitMessage('SEALED_BUNDLE', new Uint8Array(CHUNK_PAYLOAD_MAX * 2 + 1))
    expect(chunks.map((c) => c.payload.length)).toEqual([CHUNK_PAYLOAD_MAX, CHUNK_PAYLOAD_MAX, 1])
    expect(chunks.every((c) => c.count === 3)).toBe(true)
  })

  it('rejects payloads over the size cap', () => {
    expect(splitMessage('SHARE', new Uint8Array(MAX_MESSAGE_BYTES))).toHaveLength(MAX_CHUNKS)
    expect(() => splitMessage('SHARE', new Uint8Array(MAX_MESSAGE_BYTES + 1))).toThrow(RangeError)
  })

  it('gives each message a new random ID', () => {
    expect(newMessageId()).not.toEqual(newMessageId())
  })
})

describe('Reassembler', () => {
  const payload = Uint8Array.from({ length: 2048 }, (_, i) => i % 251)

  it('rebuilds a 2 KB payload from chunks in any order', () => {
    const random = mulberry32(1)
    for (const order of [
      (c: ZmpChunkList) => c,
      (c: ZmpChunkList) => [...c].reverse(),
      (c: ZmpChunkList) => shuffled(random, c),
    ]) {
      expect(roundTrip('UNSIGNED_MSG', payload, order)?.payload).toEqual(payload)
    }
  })

  it('reports progress, then delivers once', () => {
    const reassembler = new Reassembler()
    const chunks = splitMessage('UNSIGNED_MSG', payload)
    const results = chunks.map((c) => reassembler.add(c))
    expect(results[0]).toEqual({ status: 'incomplete', received: 1, count: chunks.length })
    expect(results.at(-1)?.status).toBe('complete')
    expect(reassembler.add(chunks[0]!)).toEqual({ status: 'already-complete' })
  })

  it('ignores a repeated chunk but rejects a conflicting one', () => {
    const reassembler = new Reassembler()
    const [first, second] = splitMessage('UNSIGNED_MSG', payload)
    reassembler.add(first!)
    expect(reassembler.add(first!)).toEqual({ status: 'duplicate' })
    reassembler.add(second!)
    const forged = { ...second!, payload: new Uint8Array([1, 2, 3]) }
    expect(reassembler.add(forged)).toEqual({ status: 'rejected', reason: 'conflicting-duplicate' })
  })

  it('rejects a chunk whose header disagrees with the message', () => {
    const reassembler = new Reassembler()
    const [first] = splitMessage('UNSIGNED_MSG', payload)
    reassembler.add(first!)
    expect(reassembler.add({ ...first!, index: 1, type: 'SHARE' })).toEqual({
      status: 'rejected',
      reason: 'header-mismatch',
    })
    expect(reassembler.add({ ...first!, index: 1, count: first!.count + 1 })).toEqual({
      status: 'rejected',
      reason: 'header-mismatch',
    })
  })

  it('keeps interleaved messages apart', () => {
    const reassembler = new Reassembler()
    const a = splitMessage('SHARE', payload)
    const b = splitMessage(
      'SHARE',
      payload.map((byte) => byte ^ 0xff),
    )
    const done: ZmpMessage[] = []
    for (let i = 0; i < a.length; i++) {
      for (const chunk of [a[i]!, b[i]!]) {
        const added = reassembler.add(chunk)
        if (added.status === 'complete') done.push(added.message)
      }
    }
    expect(done).toHaveLength(2)
    expect(done[0]?.payload).toEqual(payload)
    expect(done[1]?.payload).toEqual(payload.map((byte) => byte ^ 0xff))
  })

  it('drops the oldest partial message beyond its limit', () => {
    const reassembler = new Reassembler({ maxPending: 2 })
    const [a, b, c] = [1, 2, 3].map((n) =>
      splitMessage('SHARE', payload, new Uint8Array(16).fill(n)),
    )
    reassembler.add(a![0]!)
    reassembler.add(b![0]!)
    reassembler.add(c![0]!)
    expect(reassembler.add(a![1]!)).toMatchObject({ status: 'incomplete', received: 1 })
  })
})

type ZmpChunkList = ReturnType<typeof splitMessage>

describe('createInbox', () => {
  it('routes complete messages to the handler for their type', async () => {
    const received: ZmpMessage[] = []
    const inbox = createInbox({ UNSIGNED_MSG: (message) => void received.push(message) })
    const payload = Uint8Array.from({ length: 1500 }, (_, i) => i % 256)
    const outcomes: IngestOutcome[] = []
    for (const chunk of splitMessage('UNSIGNED_MSG', payload).reverse()) {
      outcomes.push(await inbox.ingest(encodeChunk(chunk)))
    }
    expect(outcomes.at(-1)).toEqual({ kind: 'delivered', type: 'UNSIGNED_MSG' })
    expect(outcomes.slice(0, -1).every((o) => o.kind === 'partial')).toBe(true)
    expect(received).toHaveLength(1)
    expect(received[0]?.payload).toEqual(payload)
  })

  it('ignores non-ZMP memos and reports malformed ones', async () => {
    const inbox = createInbox({})
    expect(await inbox.ingest(new TextEncoder().encode('thanks for the gift'))).toEqual({
      kind: 'ignored',
    })
    const broken = encodeChunk(splitMessage('WISH', new Uint8Array([1]))[0]!)
    broken[511] = 1
    expect(await inbox.ingest(broken)).toEqual({ kind: 'malformed', reason: 'nonzero-padding' })
  })

  it('delivers a message once even if the wallet rescans it', async () => {
    let calls = 0
    const inbox = createInbox({
      WISH: () => {
        calls++
      },
    })
    const memo = encodeChunk(splitMessage('WISH', new TextEncoder().encode('happy birthday'))[0]!)
    await inbox.ingest(memo)
    expect(await inbox.ingest(memo)).toEqual({ kind: 'repeat' })
    expect(calls).toBe(1)
  })

  it('reports unhandled types and handler failures without leaking content', async () => {
    const inbox = createInbox({
      REVOKE: () => {
        throw new Error('secret-detail')
      },
    })
    const nudge = encodeChunk(splitMessage('NUDGE', new Uint8Array(1))[0]!)
    expect(await inbox.ingest(nudge)).toEqual({ kind: 'unhandled', type: 'NUDGE' })
    const revoke = encodeChunk(splitMessage('REVOKE', new Uint8Array(1))[0]!)
    const outcome = await inbox.ingest(revoke)
    expect(outcome).toEqual({ kind: 'handler-error', type: 'REVOKE' })
    expect(JSON.stringify(outcome)).not.toContain('secret-detail')
  })
})

describe('fuzz (seeded)', () => {
  const types = Object.keys(MESSAGE_TYPES) as MessageType[]

  it('round-trips random payloads of random sizes in random order', () => {
    const random = mulberry32(42)
    for (let i = 0; i < 300; i++) {
      const payload = randomBytes(random, Math.floor(random() * (MAX_MESSAGE_BYTES + 1)))
      const type = types[Math.floor(random() * types.length)]!
      const message = roundTrip(type, payload, (chunks) => shuffled(random, chunks))
      expect(message?.type).toBe(type)
      expect(message?.payload).toEqual(payload)
    }
  })

  it('never throws on random memos, and only accepts what it would produce itself', () => {
    const random = mulberry32(7)
    for (let i = 0; i < 5000; i++) {
      const length = random() < 0.9 ? MEMO_BYTES : Math.floor(random() * 700)
      const memo = randomBytes(random, length)
      if (random() < 0.5 && length > 4) memo.set([0xff, 0x5a, 0x4c, 0x44, 1], 0)
      const decoded = decodeMemo(memo)
      if (decoded.kind === 'chunk') expect(encodeChunk(decoded.chunk)).toEqual(memo)
    }
  })

  it('never throws when valid memos are corrupted byte by byte', () => {
    const random = mulberry32(99)
    for (let i = 0; i < 2000; i++) {
      const chunk = splitMessage(
        'SEALED_BUNDLE',
        randomBytes(random, Math.floor(random() * 2000)),
      )[0]!
      const memo = encodeChunk(chunk)
      for (let flips = 1 + Math.floor(random() * 4); flips > 0; flips--) {
        memo[Math.floor(random() * MEMO_BYTES)] = Math.floor(random() * 256)
      }
      const decoded = decodeMemo(
        random() < 0.2 ? memo.slice(0, Math.floor(random() * MEMO_BYTES)) : memo,
      )
      if (decoded.kind === 'chunk')
        expect(decoded.chunk.payload.length).toBeLessThanOrEqual(CHUNK_PAYLOAD_MAX)
    }
  })

  it('never throws or delivers junk when random memos go through the inbox', async () => {
    const random = mulberry32(2026)
    const inbox = createInbox({})
    for (let i = 0; i < 3000; i++) {
      const memo = randomBytes(random, MEMO_BYTES)
      memo.set([0xff, 0x5a, 0x4c, 0x44, 1], 0)
      const outcome = await inbox.ingest(memo)
      expect(outcome.kind).not.toBe('delivered')
    }
  })
})
