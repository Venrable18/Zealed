import { describe, expect, it } from 'vitest'
import type { Card } from './card.ts'
import { FakeUnsignedWallet } from './fakeWallet.ts'
import { COMMITMENT_BYTES } from './format.ts'
import { readInbox } from './inbox.ts'
import {
  buildReceipt,
  checkReveal,
  commitmentFor,
  hexToBytes,
  newSalt,
  parseReceipt,
  sameCommitment,
  serializeReceipt,
  SALT_BYTES,
} from './receipt.ts'
import { memoCountFor, sendMessage, validateSend, type SendInput } from './send.ts'
import { createCard, sendReply } from './service.ts'
import type { ReceivedTx } from './walletPort.ts'

const MIN = 5_000_000n
const NOW = 1_800_000_000_000

/** A recipient and an anonymous sender, each with their own wallet, on one shared fake network. */
async function parties(overrides: Partial<Card> = {}) {
  const network = new Map<string, ReceivedTx[]>()
  const recipient = new FakeUnsignedWallet(network)
  const sender = new FakeUnsignedWallet(network)
  const made = await createCard(recipient, {
    name: 'Ada — tips',
    bio: 'Tell me what you saw.',
    minimumZat: MIN,
    acceptsReplies: true,
  })
  if (!made.ok) throw new Error('card failed')
  return { network, recipient, sender, card: { ...made.card, ...overrides } }
}

const input = (overrides: Partial<SendInput> = {}): SendInput => ({
  body: 'The documents are in the shed.',
  amountZat: MIN,
  allowReplies: false,
  keepReceipt: false,
  ...overrides,
})

describe('validateSend', () => {
  const card: Card = {
    name: 'Ada',
    bio: '',
    address: 'utestcardaddress00000000000000000001',
    minimumZat: MIN,
    acceptsReplies: true,
  }
  const errors = (o: Partial<SendInput>) => {
    const r = validateSend(card, input(o))
    return r.ok ? {} : r.errors
  }

  it('accepts a message paying at least the minimum', () => {
    expect(validateSend(card, input())).toEqual({ ok: true, amountZat: MIN })
    expect(validateSend(card, input({ amountZat: MIN * 10n })).ok).toBe(true)
  })

  it('refuses a payment below the minimum, because it would never be read', () => {
    expect(errors({ amountZat: MIN - 1n }).amount).toContain('below this card’s minimum')
    expect(errors({ amountZat: null }).amount).toBeDefined()
  })

  it('refuses empty, too long and unsafe messages, with different messages', () => {
    expect(errors({ body: '  ' }).body).toBe('Write a message first.')
    expect(errors({ body: 'a'.repeat(2049) }).body).toContain('2048 bytes')
    expect(errors({ body: 'a‮b' }).body).toContain('cannot be shown')
    expect(errors({ body: 'a'.repeat(2048) }).body).toBeUndefined()
    expect(errors({ body: 'é'.repeat(1025) }).body).toBeDefined()
  })

  it('counts how many memos a message needs, more when it has a reply address or commitment', () => {
    expect(memoCountFor(input())).toBe(1)
    expect(memoCountFor(input({ body: 'x'.repeat(2000) }))).toBe(5)
    expect(memoCountFor(input({ body: 'x'.repeat(470), allowReplies: true }))).toBeGreaterThan(
      memoCountFor(input({ body: 'x'.repeat(470) })),
    )
    expect(memoCountFor(input({ body: '' }))).toBe(1)
  })
})

describe('sendMessage: an anonymous sender with a fresh wallet', () => {
  it('sends a paid message in one transaction that the recipient reads', async () => {
    const { recipient, sender, card } = await parties()
    const result = await sendMessage(sender, card, input(), { nowMs: NOW })
    expect(result.ok).toBe(true)
    expect(sender.payments).toHaveLength(1)
    expect(sender.payments[0]).toMatchObject({ to: card.address, zat: MIN })

    const messages = await readInbox(await recipient.receivedTransactions(card.address), card)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      body: 'The documents are in the shed.',
      amountZat: MIN,
      belowMinimum: false,
    })
    expect(messages[0]?.replyTo).toBeUndefined()
  })

  it('sends a long message as several memos in the same single transaction', async () => {
    const { recipient, sender, card } = await parties()
    const body = Array.from(
      { length: 40 },
      (_, i) => `Line ${String(i)}: the details you asked about.`,
    ).join('\n')
    await sendMessage(sender, card, input({ body }), { nowMs: NOW })
    expect(sender.payments).toHaveLength(1)
    expect(sender.payments[0]?.memos.length).toBeGreaterThan(2)
    const [message] = await readInbox(await recipient.receivedTransactions(card.address), card)
    expect(message?.body).toBe(body)
  })

  it('with replies on, uses a fresh address, never reused, and the recipient can answer to it', async () => {
    const { recipient, sender, card } = await parties()
    const a = await sendMessage(sender, card, input({ allowReplies: true }), { nowMs: NOW })
    const b = await sendMessage(sender, card, input({ allowReplies: true }), { nowMs: NOW + 1 })
    if (!a.ok || !b.ok) throw new Error('expected success')
    expect(a.sent.replyTo).toBeDefined()
    expect(a.sent.replyTo).not.toBe(b.sent.replyTo)
    expect(a.sent.replyTo).not.toBe(card.address)

    const [first] = (
      await readInbox(await recipient.receivedTransactions(card.address), card)
    ).filter((m) => m.txid === a.sent.id)
    expect(first?.replyTo).toBe(a.sent.replyTo)

    // The recipient replies; the sender finds it at their fresh address.
    expect(
      await sendReply(recipient, first?.replyTo ?? '', 'Thank you. I will look into it.'),
    ).toEqual({ ok: true })
    const replies = await readInbox(await sender.receivedTransactions(a.sent.replyTo ?? ''), {
      minimumZat: 0n,
    })
    expect(replies.map((r) => r.body)).toEqual(['Thank you. I will look into it.'])
    expect(replies[0]?.replyTo).toBeUndefined()
    expect(
      await readInbox(await sender.receivedTransactions(b.sent.replyTo ?? ''), { minimumZat: 0n }),
    ).toEqual([])
  })

  it('does not ask for a reply address when the card has replies off, even if asked', async () => {
    const { sender, card } = await parties({ acceptsReplies: false })
    const before = sender.addressCount
    const result = await sendMessage(sender, card, input({ allowReplies: true }), { nowMs: NOW })
    expect(result.ok && result.sent.replyTo).toBeUndefined()
    expect(sender.addressCount).toBe(before)
  })

  it('a message with no reply address is sent without any', async () => {
    const { sender, card } = await parties()
    const before = sender.addressCount
    const result = await sendMessage(sender, card, input({ allowReplies: false }), { nowMs: NOW })
    expect(result.ok && result.sent.replyTo).toBeUndefined()
    expect(sender.addressCount).toBe(before)
  })

  it('does nothing for invalid input, no wallet, too little money, or a failed send', async () => {
    const { sender, card } = await parties()
    expect(
      await sendMessage(sender, card, input({ amountZat: MIN - 1n }), { nowMs: NOW }),
    ).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await sendMessage(null, card, input(), { nowMs: NOW })).toEqual({
      ok: false,
      reason: 'wallet-unavailable',
    })

    sender.spendable = MIN + 5n
    expect(await sendMessage(sender, card, input(), { nowMs: NOW, feeZat: 100n })).toEqual({
      ok: false,
      reason: 'insufficient-funds',
      spendableZat: MIN + 5n,
    })
    sender.spendable = 10n * MIN
    sender.failNext = 'send'
    expect(await sendMessage(sender, card, input(), { nowMs: NOW })).toEqual({
      ok: false,
      reason: 'failed',
    })
    sender.failNext = 'balance'
    expect(await sendMessage(sender, card, input(), { nowMs: NOW })).toEqual({
      ok: false,
      reason: 'failed',
    })
    expect(sender.payments).toHaveLength(0)
  })

  it('does not keep the message text unless a receipt was asked for', async () => {
    const { sender, card } = await parties()
    const plain = await sendMessage(sender, card, input(), { nowMs: NOW })
    expect(plain.ok && plain.sent.body).toBeUndefined()
    expect(plain.ok && plain.sent.receipt).toBeUndefined()
  })
})

describe('receipts (stretch)', () => {
  it('the commitment hides the message but binds the sender to it', async () => {
    const salt = newSalt()
    expect(salt).toHaveLength(SALT_BYTES)
    const commitment = await commitmentFor(salt, 'the message')
    expect(commitment).toHaveLength(COMMITMENT_BYTES)
    expect(sameCommitment(commitment, await commitmentFor(salt, 'the message'))).toBe(true)
    expect(sameCommitment(commitment, await commitmentFor(salt, 'the messagE'))).toBe(false)
    expect(sameCommitment(commitment, await commitmentFor(newSalt(), 'the message'))).toBe(false)
    expect(new TextDecoder('latin1').decode(commitment)).not.toContain('message')
  })

  it('a message sent with a receipt can be proven later: the recipient matches the commitment', async () => {
    const { recipient, sender, card } = await parties()
    const result = await sendMessage(
      sender,
      card,
      input({ keepReceipt: true, body: 'I saw the shipment on the 3rd.' }),
      { nowMs: NOW },
    )
    if (!result.ok || result.sent.receipt === undefined) throw new Error('expected a receipt')
    const { receipt } = result.sent

    const messages = await readInbox(await recipient.receivedTransactions(card.address), card)
    expect(messages[0]?.commitment).toBeDefined()

    const reveal = await checkReveal(receipt.saltHex, 'I saw the shipment on the 3rd.')
    expect(
      reveal.ok && sameCommitment(reveal.commitment, messages[0]?.commitment ?? new Uint8Array()),
    ).toBe(true)

    const wrong = await checkReveal(receipt.saltHex, 'I saw the shipment on the 4th.')
    expect(
      wrong.ok && sameCommitment(wrong.commitment, messages[0]?.commitment ?? new Uint8Array()),
    ).toBe(false)
    expect(result.sent.body).toBe('I saw the shipment on the 3rd.')
    expect(receipt).toMatchObject({ txid: result.sent.id, recipient: card.address, sentAtMs: NOW })
  })

  it('the revealed text is compared the same way it was committed (surrounding space does not matter)', async () => {
    const { sender, card } = await parties()
    const result = await sendMessage(
      sender,
      card,
      input({ keepReceipt: true, body: '  padded message  ' }),
      { nowMs: NOW },
    )
    if (!result.ok || result.sent.receipt === undefined) throw new Error('expected a receipt')
    const a = await checkReveal(result.sent.receipt.saltHex, 'padded message')
    const b = await checkReveal(result.sent.receipt.saltHex, '  padded message \n')
    expect(a.ok && b.ok && sameCommitment(a.commitment, b.commitment)).toBe(true)
  })

  it('reports a bad salt or message when revealing', async () => {
    expect(await checkReveal('xyz', 'hi')).toEqual({ ok: false, reason: 'bad-salt' })
    expect(await checkReveal('ab'.repeat(15), 'hi')).toEqual({ ok: false, reason: 'bad-salt' })
    expect(await checkReveal('ab'.repeat(16), '   ')).toEqual({ ok: false, reason: 'bad-message' })
    expect(await checkReveal('AB'.repeat(16), 'hi')).toMatchObject({ ok: true })
  })

  it('a receipt file round-trips, holds no message text, and hostile files are rejected', () => {
    const receipt = buildReceipt({
      txid: 'tx1',
      salt: new Uint8Array(16).fill(1),
      commitment: new Uint8Array(32).fill(2),
      sentAtMs: NOW,
      recipient: 'utestcardaddress00000000000000000001',
    })
    const text = serializeReceipt(receipt)
    expect(parseReceipt(text)).toEqual(receipt)
    expect(text).not.toContain('message')
    expect(hexToBytes(receipt.saltHex)).toEqual(new Uint8Array(16).fill(1))
    const base = JSON.parse(text) as Record<string, unknown>
    for (const bad of [
      '',
      'not json',
      '[]',
      'null',
      JSON.stringify({ ...base, app: 'other' }),
      JSON.stringify({ ...base, v: 2 }),
      JSON.stringify({ ...base, saltHex: 'abcd' }),
      JSON.stringify({ ...base, commitmentHex: 'zz'.repeat(32) }),
      JSON.stringify({ ...base, sentAtMs: -1 }),
      JSON.stringify({ ...base, txid: '' }),
      JSON.stringify({ ...base, recipient: 7 }),
    ]) {
      expect(parseReceipt(bad)).toBeNull()
    }
  })

  it('never throws on random receipt text (seeded fuzz)', () => {
    let a = 5
    const next = () => ((a = (a * 1664525 + 1013904223) | 0) >>> 0) / 4294967296
    for (let i = 0; i < 2000; i++) {
      const junk = Array.from({ length: Math.floor(next() * 120) }, () =>
        String.fromCharCode(Math.floor(next() * 128)),
      ).join('')
      expect(() => parseReceipt(junk)).not.toThrow()
    }
  })
})
