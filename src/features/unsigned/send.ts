import { UNSIGNED_MESSAGE_MAX_BYTES } from '../../config/constants.ts'
import { toMemos } from '../../zmp/index.ts'
import type { Card } from './card.ts'
import { encodeUnsigned, isReasonableBody, type BodyProblem } from './format.ts'
import { buildReceipt, commitmentFor, newSalt, type Receipt } from './receipt.ts'
import type { UnsignedWalletPort } from './walletPort.ts'

export interface SendInput {
  body: string
  amountZat: bigint | null
  /** Ask for a reply: a fresh address is made for it. */
  allowReplies: boolean
  /** Keep a receipt that can later prove what was sent. */
  keepReceipt: boolean
}

export type SendField = 'body' | 'amount'

export type ValidateSendResult =
  { ok: true; amountZat: bigint } | { ok: false; errors: Partial<Record<SendField, string>> }

const BODY_ERRORS: Record<BodyProblem, string> = {
  empty: 'Write a message first.',
  'too-long': `A message can be up to ${String(UNSIGNED_MESSAGE_MAX_BYTES)} bytes.`,
  unsafe: 'The message has characters that cannot be shown. Remove them.',
}

export function validateSend(card: Card, input: SendInput): ValidateSendResult {
  const errors: Partial<Record<SendField, string>> = {}
  const problem = isReasonableBody(input.body)
  if (problem !== null) errors.body = BODY_ERRORS[problem]
  if (input.amountZat === null) errors.amount = 'Enter how much to pay.'
  else if (input.amountZat < card.minimumZat)
    errors.amount = 'That is below this card’s minimum, so it would not be read.'
  if (Object.keys(errors).length > 0 || input.amountZat === null) return { ok: false, errors }
  return { ok: true, amountZat: input.amountZat }
}

/** A made-up address of the usual length, used only to count how many memos a message needs. */
const SIZING_ADDRESS = 'u'.repeat(140)

/** How many memos this message needs, for the fee preview. */
export function memoCountFor(
  input: Pick<SendInput, 'body' | 'allowReplies' | 'keepReceipt'>,
): number {
  try {
    return toMemos(
      'UNSIGNED_MSG',
      encodeUnsigned({
        body: input.body,
        ...(input.allowReplies ? { replyTo: SIZING_ADDRESS } : {}),
        ...(input.keepReceipt ? { commitment: new Uint8Array(32) } : {}),
      }),
    ).length
  } catch {
    return 1
  }
}

export interface SentMessage {
  id: string
  cardName: string
  recipient: string
  amountZat: bigint
  sentAtMs: number
  /** The fresh address replies come to, if replies were asked for. */
  replyTo?: string
  /** Kept only when a receipt was requested, so the message can be revealed later. Sensitive. */
  body?: string
  receipt?: Receipt
}

export type SendResult =
  | { ok: true; sent: SentMessage }
  | { ok: false; reason: 'invalid'; errors: Partial<Record<SendField, string>> }
  | { ok: false; reason: 'wallet-unavailable' }
  | { ok: false; reason: 'insufficient-funds'; spendableZat: bigint }
  | { ok: false; reason: 'failed' }

/**
 * Sends a paid message to a card, in one transaction. Nothing is sent unless every check passes.
 * The reply address, if asked for, is a fresh one from the wallet, never the wallet's main address.
 */
export async function sendMessage(
  wallet: UnsignedWalletPort | null,
  card: Card,
  input: SendInput,
  options: { nowMs: number; feeZat?: bigint },
): Promise<SendResult> {
  const checked = validateSend(card, input)
  if (!checked.ok) return { ok: false, reason: 'invalid', errors: checked.errors }
  if (wallet === null) return { ok: false, reason: 'wallet-unavailable' }

  try {
    const spendable = await wallet.spendableZat()
    if (spendable < checked.amountZat + (options.feeZat ?? 0n))
      return { ok: false, reason: 'insufficient-funds', spendableZat: spendable }

    const replyTo =
      input.allowReplies && card.acceptsReplies ? await wallet.newAddress() : undefined
    const body = input.body.trim()
    const salt = input.keepReceipt ? newSalt() : undefined
    const commitment = salt === undefined ? undefined : await commitmentFor(salt, body)

    const memos = toMemos(
      'UNSIGNED_MSG',
      encodeUnsigned({
        body,
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(commitment === undefined ? {} : { commitment }),
      }),
    )
    const { txid } = await wallet.sendPayment({ to: card.address, zat: checked.amountZat, memos })

    const receipt =
      salt === undefined || commitment === undefined
        ? undefined
        : buildReceipt({
            txid,
            salt,
            commitment,
            sentAtMs: options.nowMs,
            recipient: card.address,
          })
    return {
      ok: true,
      sent: {
        id: txid,
        cardName: card.name,
        recipient: card.address,
        amountZat: checked.amountZat,
        sentAtMs: options.nowMs,
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(receipt === undefined ? {} : { body, receipt }),
      },
    }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
