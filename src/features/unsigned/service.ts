import { toMemos } from '../../zmp/index.ts'
import { validateCard, type Card, type CardField, type CardInput } from './card.ts'
import { cleanBody, encodeUnsigned } from './format.ts'
import type { UnsignedWalletPort } from './walletPort.ts'

export type CreateCardResult =
  | { ok: true; card: Card }
  | { ok: false; reason: 'invalid'; errors: Partial<Record<CardField, string>> }
  | { ok: false; reason: 'wallet-unavailable' }
  | { ok: false; reason: 'wallet-error' }

/** Validates, then asks the wallet for a fresh address for this card. Nothing is created if either fails. */
export async function createCard(
  wallet: UnsignedWalletPort | null,
  input: CardInput,
): Promise<CreateCardResult> {
  const checked = validateCard(input)
  if (!checked.ok) return { ok: false, reason: 'invalid', errors: checked.errors }
  if (wallet === null) return { ok: false, reason: 'wallet-unavailable' }
  try {
    const address = await wallet.newAddress()
    return { ok: true, card: { ...checked.value, address } }
  } catch {
    return { ok: false, reason: 'wallet-error' }
  }
}

export type ReplyResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'wallet-unavailable' | 'failed' }

/** Sends a reply to the address the sender gave. The reply carries no reply-to of its own. */
export async function sendReply(
  wallet: UnsignedWalletPort | null,
  to: string,
  text: string,
): Promise<ReplyResult> {
  if (cleanBody(text) === null) return { ok: false, reason: 'invalid' }
  if (wallet === null) return { ok: false, reason: 'wallet-unavailable' }
  try {
    await wallet.sendMemos({ to, memos: toMemos('UNSIGNED_MSG', encodeUnsigned({ body: text })) })
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
