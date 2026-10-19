import { concat, constantTimeEqual, randomBytes, toBuffer, toHex } from '../../crypto/bytes.ts'
import { COMMITMENT_BYTES, cleanBody } from './format.ts'

/**
 * Optional submission receipt. The memo carries SHA-256(salt || message). The sender keeps the
 * salt and message; later they can reveal both, and the recipient checks the revealed message
 * matches the commitment they received. The commitment hides the message (the salt is random and
 * secret) and binds the sender to it (it cannot be changed afterwards).
 */
export const SALT_BYTES = 16

export function newSalt(): Uint8Array {
  return randomBytes(SALT_BYTES)
}

/** SHA-256(salt || message). The salt has a fixed length, so the join is unambiguous. */
export async function commitmentFor(salt: Uint8Array, body: string): Promise<Uint8Array> {
  const bytes = concat(salt, new TextEncoder().encode(body))
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toBuffer(bytes)))
}

export function hexToBytes(hex: string): Uint8Array | null {
  return /^([0-9a-f]{2})+$/i.test(hex)
    ? Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))
    : null
}

/** What the sender downloads. It holds no message text: the sender keeps that separately. */
export interface Receipt {
  txid: string
  saltHex: string
  commitmentHex: string
  sentAtMs: number
  /** The card's address the message was paid to. */
  recipient: string
}

const APP = 'zealed-unsigned-receipt'

export function serializeReceipt(receipt: Receipt): string {
  return JSON.stringify({ app: APP, v: 1, ...receipt }, null, 2)
}

/** Reads a receipt from untrusted text. Returns null if anything is wrong. Never throws. */
export function parseReceipt(text: string): Receipt | null {
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return null
    const { app, v, txid, saltHex, commitmentHex, sentAtMs, recipient } = data as Record<
      string,
      unknown
    >
    if (app !== APP || v !== 1) return null
    if (typeof txid !== 'string' || txid.length === 0 || txid.length > 200) return null
    if (typeof saltHex !== 'string' || hexToBytes(saltHex)?.length !== SALT_BYTES) return null
    if (typeof commitmentHex !== 'string' || hexToBytes(commitmentHex)?.length !== COMMITMENT_BYTES)
      return null
    if (typeof sentAtMs !== 'number' || !Number.isSafeInteger(sentAtMs) || sentAtMs < 0) return null
    if (typeof recipient !== 'string' || recipient.length === 0 || recipient.length > 600)
      return null
    return { txid, saltHex, commitmentHex, sentAtMs, recipient }
  } catch {
    return null
  }
}

export function buildReceipt(args: {
  txid: string
  salt: Uint8Array
  commitment: Uint8Array
  sentAtMs: number
  recipient: string
}): Receipt {
  return {
    txid: args.txid,
    saltHex: toHex(args.salt),
    commitmentHex: toHex(args.commitment),
    sentAtMs: args.sentAtMs,
    recipient: args.recipient,
  }
}

export type RevealCheck =
  { ok: true; commitment: Uint8Array } | { ok: false; reason: 'bad-salt' | 'bad-message' }

/** The commitment for a revealed message and salt, so it can be compared with what was received. */
export async function checkReveal(saltHex: string, message: string): Promise<RevealCheck> {
  const salt = hexToBytes(saltHex.trim())
  if (salt?.length !== SALT_BYTES) return { ok: false, reason: 'bad-salt' }
  const body = cleanBody(message)
  if (body === null) return { ok: false, reason: 'bad-message' }
  return { ok: true, commitment: await commitmentFor(salt, body) }
}

export function sameCommitment(a: Uint8Array, b: Uint8Array): boolean {
  return constantTimeEqual(a, b)
}
