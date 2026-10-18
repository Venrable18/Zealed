import { describe, expect, it } from 'vitest'
import { base64UrlToText, textToBase64Url } from '../../lib/base64url.ts'
import { decodeMemo, encodeChunk, splitMessage } from '../../zmp/index.ts'
import {
  MAX_MINIMUM_ZAT,
  MIN_MINIMUM_ZAT,
  validateCard,
  type Card,
  type CardInput,
} from './card.ts'
import { CARD_PATH, cardUrl, decodeCard, encodeCard, readCardFromHash } from './cardLink.ts'
import { FakeUnsignedWallet } from './fakeWallet.ts'
import { COMMITMENT_BYTES, cleanBody, decodeUnsigned, encodeUnsigned } from './format.ts'
import { readInbox, summarize } from './inbox.ts'
import { createCard, sendReply } from './service.ts'

const ADDRESS = 'utestcardaddress00000000000000000001'
const REPLY = 'utestreplyaddress0000000000000000001'
const ZEC = 100_000_000n
const MIN = 5_000_000n
const card: Card = {
  name: 'Ada — tips',
  bio: 'Tell me what you saw.',
  address: ADDRESS,
  minimumZat: MIN,
  acceptsReplies: true,
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('base64url', () => {
  it('round-trips text including emoji and non-English', () => {
    for (const text of ['', 'hello', 'Ada — tips 🎁', 'Chúc mừng', '{"a":1}']) {
      expect(base64UrlToText(textToBase64Url(text))).toBe(text)
    }
    expect(textToBase64Url('???>>>')).not.toMatch(/[+/=]/)
  })

  it('rejects anything that is not base64url of valid UTF-8, without throwing', () => {
    for (const bad of ['not base64!', 'a b', '%%%', '/+==', 'A'])
      expect(base64UrlToText(bad)).toBeNull()
    expect(base64UrlToText('_w')).toBeNull() // 0xFF alone is not valid UTF-8
  })
})

describe('validateCard', () => {
  const input = (overrides: Partial<CardInput> = {}): CardInput => ({
    name: 'Ada',
    bio: 'Hi',
    minimumZat: MIN,
    acceptsReplies: true,
    ...overrides,
  })

  it('accepts a good card and trims text', () => {
    expect(validateCard(input({ name: '  Ada  ', bio: '  Hi  ' }))).toEqual({
      ok: true,
      value: { name: 'Ada', bio: 'Hi', minimumZat: MIN, acceptsReplies: true },
    })
    expect(validateCard(input({ bio: '' })).ok).toBe(true)
  })

  it('checks each field', () => {
    const errors = (o: Partial<CardInput>) => {
      const r = validateCard(input(o))
      return r.ok ? {} : r.errors
    }
    expect(errors({ name: ' ' }).name).toBeDefined()
    expect(errors({ name: 'x'.repeat(61) }).name).toBeDefined()
    expect(errors({ name: 'two\nlines' }).name).toBeDefined()
    expect(errors({ name: 'bad\u0007' }).name).toBeDefined()
    expect(errors({ bio: 'x'.repeat(281) }).bio).toBeDefined()
    expect(errors({ bio: 'a‮b' }).bio).toBeDefined()
    expect(errors({ minimumZat: null }).minimum).toBeDefined()
    expect(errors({ minimumZat: MIN_MINIMUM_ZAT - 1n }).minimum).toBeDefined()
    expect(errors({ minimumZat: MAX_MINIMUM_ZAT + 1n }).minimum).toBeDefined()
    expect(errors({ minimumZat: MIN_MINIMUM_ZAT }).minimum).toBeUndefined()
    expect(errors({ bio: 'a\nb' }).bio).toBeUndefined()
  })
})

describe('card link', () => {
  it('round-trips, with the card in the URL fragment and nothing in the path or query', () => {
    expect(decodeCard(encodeCard(card))).toEqual(card)
    const url = new URL(cardUrl('https://zealed.example', card))
    expect(url.pathname).toBe(CARD_PATH)
    expect(url.search).toBe('')
    expect(readCardFromHash(url.hash)).toEqual(card)
    expect(readCardFromHash('')).toBeNull()
  })

  it('keeps the minimum exact, including large values', () => {
    expect(decodeCard(encodeCard({ ...card, minimumZat: MAX_MINIMUM_ZAT }))?.minimumZat).toBe(
      MAX_MINIMUM_ZAT,
    )
    expect(decodeCard(encodeCard({ ...card, acceptsReplies: false }))?.acceptsReplies).toBe(false)
  })

  it('rejects hostile or broken input without throwing', () => {
    const encode = (value: unknown) => textToBase64Url(JSON.stringify(value))
    const base = { v: 1, n: card.name, b: card.bio, a: card.address, m: '5000000', r: 1 }
    for (const bad of [
      '',
      'garbage!',
      'A'.repeat(2001),
      textToBase64Url('{"v":1'),
      encode(null),
      encode([]),
      encode({ ...base, v: 2 }),
      encode({ ...base, n: '' }),
      encode({ ...base, n: 'x'.repeat(100) }),
      encode({ ...base, n: 'a‮b' }),
      encode({ ...base, b: 'x'.repeat(300) }),
      encode({ ...base, a: 'has spaces' }),
      encode({ ...base, a: 5 }),
      encode({ ...base, m: '5' }),
      encode({ ...base, m: '99999999999999999999' }),
      encode({ ...base, m: -1 }),
      encode({ ...base, r: 2 }),
    ]) {
      expect(decodeCard(bad)).toBeNull()
    }
  })
})

describe('message format', () => {
  it('round-trips a plain message, with a reply address, and with a commitment', () => {
    expect(decodeUnsigned(encodeUnsigned({ body: 'The files are in the shed.' }))).toEqual({
      body: 'The files are in the shed.',
    })
    expect(decodeUnsigned(encodeUnsigned({ body: 'hi', replyTo: REPLY }))).toEqual({
      body: 'hi',
      replyTo: REPLY,
    })
    const commitment = new Uint8Array(COMMITMENT_BYTES).fill(7)
    expect(decodeUnsigned(encodeUnsigned({ body: 'hi', replyTo: REPLY, commitment }))).toEqual({
      body: 'hi',
      replyTo: REPLY,
      commitment,
    })
    expect(decodeUnsigned(encodeUnsigned({ body: 'hi', commitment }))?.commitment).toEqual(
      commitment,
    )
  })

  it('limits the message to 2 KB of bytes, counting emoji and accents', () => {
    expect(cleanBody('a'.repeat(2048))).not.toBeNull()
    expect(cleanBody('a'.repeat(2049))).toBeNull()
    expect(cleanBody('é'.repeat(1024))).not.toBeNull()
    expect(cleanBody('é'.repeat(1025))).toBeNull()
    expect(() => encodeUnsigned({ body: 'a'.repeat(2049) })).toThrow(RangeError)
  })

  it('refuses empty text, control and bidi characters, but allows line breaks', () => {
    expect(cleanBody('   ')).toBeNull()
    expect(cleanBody('a\u0000b')).toBeNull()
    expect(cleanBody('abc‮def')).toBeNull()
    expect(cleanBody('line one\nline two\tindented')).toBe('line one\nline two\tindented')
  })

  it('refuses bad addresses and commitments when building, and unknown flags when reading', () => {
    expect(() => encodeUnsigned({ body: 'x', replyTo: 'bad address' })).toThrow(RangeError)
    expect(() => encodeUnsigned({ body: 'x', commitment: new Uint8Array(5) })).toThrow(RangeError)
    const ok = encodeUnsigned({ body: 'x' })
    expect(decodeUnsigned(Uint8Array.from([ok[0] ?? 0, 0x80, ...ok.slice(2)]))).toBeNull()
    expect(decodeUnsigned(Uint8Array.from([2, ...ok.slice(1)]))).toBeNull()
    expect(decodeUnsigned(new Uint8Array(0))).toBeNull()
    expect(decodeUnsigned(ok.slice(0, 2))).toBeNull()
  })

  it('never throws on random or damaged bytes (seeded fuzz)', () => {
    const random = mulberry32(21)
    const valid = encodeUnsigned({
      body: 'hello there',
      replyTo: REPLY,
      commitment: new Uint8Array(32),
    })
    for (let i = 0; i < 4000; i++) {
      const junk = Uint8Array.from({ length: Math.floor(random() * 200) }, () =>
        Math.floor(random() * 256),
      )
      expect(() => decodeUnsigned(junk)).not.toThrow()
      const damaged = valid.slice(
        0,
        random() < 0.3 ? Math.floor(random() * valid.length) : valid.length,
      )
      for (let f = Math.floor(random() * 4); f > 0 && damaged.length > 0; f--)
        damaged[Math.floor(random() * damaged.length)] = Math.floor(random() * 256)
      expect(() => decodeUnsigned(damaged)).not.toThrow()
    }
  })
})

describe('readInbox', () => {
  const T = 1_800_000_000_000

  it('reassembles a long message sent in several memos, with its amount and block time', async () => {
    const wallet = new FakeUnsignedWallet()
    const text = Array.from(
      { length: 40 },
      (_, i) => `Line ${String(i)}: the details you asked about.`,
    ).join('\n')
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(1500)
    wallet.receive(ADDRESS, {
      txid: 'tx1',
      receivedAtMs: T,
      amountZat: 6_000_000n,
      messages: [{ body: text, replyTo: REPLY }],
    })
    const memoCount = (await wallet.receivedTransactions(ADDRESS))[0]?.memos.length ?? 0
    expect(memoCount).toBeGreaterThan(2)

    const messages = await readInbox(await wallet.receivedTransactions(ADDRESS), card)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      txid: 'tx1',
      receivedAtMs: T,
      amountZat: 6_000_000n,
      body: text,
      replyTo: REPLY,
      belowMinimum: false,
    })
  })

  it('filters a message that paid less than the minimum into the hidden folder', async () => {
    const wallet = new FakeUnsignedWallet()
    wallet.receive(ADDRESS, {
      txid: 'paid',
      receivedAtMs: T,
      amountZat: MIN,
      messages: ['I paid enough'],
    })
    wallet.receive(ADDRESS, {
      txid: 'under',
      receivedAtMs: T + 1,
      amountZat: MIN - 1n,
      messages: ['I paid too little'],
    })
    wallet.receive(ADDRESS, {
      txid: 'free',
      receivedAtMs: T + 2,
      amountZat: 0n,
      messages: ['I paid nothing'],
    })
    const messages = await readInbox(await wallet.receivedTransactions(ADDRESS), card)
    const bodies = (below: boolean) =>
      messages
        .filter((m) => m.belowMinimum === below)
        .map((m) => m.body)
        .sort()
    expect(bodies(false)).toEqual(['I paid enough'])
    expect(bodies(true)).toEqual(['I paid nothing', 'I paid too little'])
  })

  it('counts exactly the minimum as paid, and one zatoshi less as underpaid', async () => {
    const wallet = new FakeUnsignedWallet()
    wallet.receive(ADDRESS, { txid: 'a', receivedAtMs: T, amountZat: MIN, messages: ['x'] })
    wallet.receive(ADDRESS, { txid: 'b', receivedAtMs: T, amountZat: MIN - 1n, messages: ['y'] })
    const byTx = new Map(
      (await readInbox(await wallet.receivedTransactions(ADDRESS), card)).map((m) => [m.txid, m]),
    )
    expect(byTx.get('a')?.belowMinimum).toBe(false)
    expect(byTx.get('b')?.belowMinimum).toBe(true)
  })

  it('makes each message pay for itself: extra messages in one payment are not paid', async () => {
    const wallet = new FakeUnsignedWallet()
    wallet.receive(ADDRESS, {
      txid: 'bulk',
      receivedAtMs: T,
      amountZat: MIN,
      messages: ['first', 'second', 'third'],
    })
    const messages = await readInbox(await wallet.receivedTransactions(ADDRESS), card)
    expect(messages).toHaveLength(3)
    expect(messages.filter((m) => !m.belowMinimum).map((m) => m.body)).toEqual(['first'])
    expect(messages.filter((m) => m.belowMinimum)).toHaveLength(2)
    expect(summarize(messages).totalZat).toBe(MIN)
  })

  it('ignores memos that are not Zealed messages or are malformed', async () => {
    const wallet = new FakeUnsignedWallet()
    const nudge = encodeChunk(splitMessage('NUDGE', new Uint8Array(16))[0]!)
    const badPayload = encodeChunk(splitMessage('UNSIGNED_MSG', new Uint8Array([9, 9, 9, 9]))[0]!)
    const unsafe = splitMessage(
      'UNSIGNED_MSG',
      Uint8Array.from([1, 0, ...new TextEncoder().encode('bad‮text')]),
    ).map(encodeChunk)
    wallet.receive(ADDRESS, {
      txid: 't',
      receivedAtMs: T,
      amountZat: 10n * MIN,
      messages: ['real one'],
      rawMemos: [
        new TextEncoder().encode('thanks for dinner'),
        nudge,
        badPayload,
        ...unsafe,
        new Uint8Array(512),
      ],
    })
    const messages = await readInbox(await wallet.receivedTransactions(ADDRESS), card)
    expect(messages.map((m) => m.body)).toEqual(['real one'])
  })

  it('lists newest first, keeps ids stable across rescans, and keeps reply and commitment', async () => {
    const wallet = new FakeUnsignedWallet()
    const commitment = new Uint8Array(32).fill(9)
    wallet.receive(ADDRESS, { txid: 'old', receivedAtMs: T, amountZat: MIN, messages: ['older'] })
    wallet.receive(ADDRESS, {
      txid: 'new',
      receivedAtMs: T + 5000,
      amountZat: MIN,
      messages: [{ body: 'newer', commitment }],
    })
    const first = await readInbox(await wallet.receivedTransactions(ADDRESS), card)
    expect(first.map((m) => m.body)).toEqual(['newer', 'older'])
    expect(first[0]?.commitment).toEqual(commitment)
    expect(first[1]?.replyTo).toBeUndefined()
    const again = await readInbox(await wallet.receivedTransactions(ADDRESS), card)
    expect(again.map((m) => m.id)).toEqual(first.map((m) => m.id))
    expect(new Set(first.map((m) => m.id)).size).toBe(2)
  })

  it('summarises earnings, counting each payment once and showing what the hidden folder holds', async () => {
    const wallet = new FakeUnsignedWallet()
    wallet.receive(ADDRESS, { txid: '1', receivedAtMs: T, amountZat: 2n * ZEC, messages: ['a'] })
    wallet.receive(ADDRESS, { txid: '2', receivedAtMs: T, amountZat: MIN, messages: ['b'] })
    wallet.receive(ADDRESS, { txid: '3', receivedAtMs: T, amountZat: 1_000_000n, messages: ['c'] })
    expect(summarize(await readInbox(await wallet.receivedTransactions(ADDRESS), card))).toEqual({
      totalZat: 2n * ZEC + MIN + 1_000_000n,
      messages: 2,
      belowMinimum: 1,
      belowMinimumZat: 1_000_000n,
    })
    expect(summarize([])).toEqual({
      totalZat: 0n,
      messages: 0,
      belowMinimum: 0,
      belowMinimumZat: 0n,
    })
  })

  it('a message sent from another wallet appears reassembled, and an underpaid one is filtered', async () => {
    const recipient = new FakeUnsignedWallet()
    const address = await recipient.newAddress()
    const cardForAddress = { ...card, address }
    const text = 'x'.repeat(2000)
    // A different wallet's send, as the recipient's wallet would later see it.
    recipient.receive(address, {
      txid: 'from-elsewhere',
      receivedAtMs: T,
      amountZat: 3n * MIN,
      messages: [text],
    })
    recipient.receive(address, {
      txid: 'cheap',
      receivedAtMs: T + 1,
      amountZat: 1000n,
      messages: ['buy now!!!'],
    })
    const messages = await readInbox(await recipient.receivedTransactions(address), cardForAddress)
    expect(messages.find((m) => !m.belowMinimum)?.body).toBe(text)
    expect(messages.filter((m) => m.belowMinimum).map((m) => m.body)).toEqual(['buy now!!!'])
  })
})

describe('service', () => {
  const input: CardInput = { name: 'Ada', bio: 'Hi', minimumZat: MIN, acceptsReplies: true }

  it('creates a card with a fresh address from the wallet', async () => {
    const wallet = new FakeUnsignedWallet()
    const a = await createCard(wallet, input)
    const b = await createCard(wallet, input)
    expect(a.ok && b.ok && a.card.address !== b.card.address).toBe(true)
    expect(a.ok && a.card).toMatchObject({ name: 'Ada', minimumZat: MIN, acceptsReplies: true })
  })

  it('does not touch the wallet for invalid input, and says so when there is no wallet or it fails', async () => {
    const wallet = new FakeUnsignedWallet()
    expect(await createCard(wallet, { ...input, name: '' })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
    expect(wallet.addressCount).toBe(0)
    expect(await createCard(null, input)).toEqual({ ok: false, reason: 'wallet-unavailable' })
    wallet.failNext = 'address'
    expect(await createCard(wallet, input)).toEqual({ ok: false, reason: 'wallet-error' })
  })

  it('sends a reply as a message the sender can read, with no reply address of its own', async () => {
    const wallet = new FakeUnsignedWallet()
    expect(await sendReply(wallet, REPLY, 'Thank you, I will look into it.')).toEqual({ ok: true })
    expect(wallet.sent).toHaveLength(1)
    expect(wallet.sent[0]?.to).toBe(REPLY)
    const first = decodeMemo(wallet.sent[0]?.memos[0] ?? new Uint8Array())
    expect(first.kind === 'chunk' && first.chunk.type).toBe('UNSIGNED_MSG')
    const messages = await readInbox(
      [{ txid: 'r', receivedAtMs: 1, amountZat: MIN, memos: wallet.sent[0]?.memos ?? [] }],
      card,
    )
    expect(messages[0]).toMatchObject({ body: 'Thank you, I will look into it.' })
    expect(messages[0]?.replyTo).toBeUndefined()
  })

  it('refuses an empty or oversized reply, and reports a missing wallet or a failure', async () => {
    const wallet = new FakeUnsignedWallet()
    expect(await sendReply(wallet, REPLY, '  ')).toEqual({ ok: false, reason: 'invalid' })
    expect(await sendReply(wallet, REPLY, 'a'.repeat(2049))).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(await sendReply(null, REPLY, 'hi')).toEqual({ ok: false, reason: 'wallet-unavailable' })
    wallet.failNext = 'send'
    expect(await sendReply(wallet, REPLY, 'hi')).toEqual({ ok: false, reason: 'failed' })
    expect(wallet.sent).toHaveLength(0)
  })
})
