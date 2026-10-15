import type { ChainClient } from 'tlock-js'
import { sealTimelocked } from '../../crypto/bundle.ts'
import { toHex } from '../../crypto/bytes.ts'
import { encodeChunk, splitMessage } from '../../zmp/index.ts'
import type { SealField, SealInput, SentItem } from './types.ts'
import { validateSeal } from './validate.ts'
import type { LegacyWalletPort } from './walletPort.ts'

export type SealResult =
  | { ok: true; item: SentItem }
  | { ok: false; reason: 'invalid'; errors: Partial<Record<SealField, string>> }
  | { ok: false; reason: 'wallet-unavailable' }
  /** The letter could not be sealed (for example drand could not be reached). Nothing was sent. */
  | { ok: false; reason: 'seal-failed' }
  /** Funding the gift wallet failed. Nothing was sent. */
  | { ok: false; reason: 'funding-failed' }
  /** The gift was funded but the letter was not delivered. `item` allows a retry. */
  | { ok: false; reason: 'delivery-failed'; item: SentItem }

interface SealOptions {
  nowMs: number
  client?: ChainClient
}

/** Splits a sealed bundle into the memos that carry it. */
export function bundleToMemos(bundle: Uint8Array): Uint8Array[] {
  return splitMessage('SEALED_BUNDLE', bundle).map(encodeChunk)
}

/** What the sender will pay, to show before anything is sent. */
export async function previewFee(
  wallet: LegacyWalletPort,
  input: SealInput,
  letterBytesHint = 0,
): Promise<bigint> {
  // A sealed letter is its text plus the key lock and encryption overhead: about 1 KB extra.
  const memoCount = Math.max(1, Math.ceil((letterBytesHint + 1500) / 486))
  return wallet.estimateFee({ memoCount, fundsZat: input.amountZat })
}

/**
 * Seals a letter (and a gift, if any) and sends it. Order matters: the gift wallet is funded
 * before the letter is delivered, so a recipient can never open a letter whose funds are missing.
 * If delivery fails after funding, the result carries what is needed to retry and to recover the
 * funds, because the sender has no other copy of the gift wallet's seed.
 */
export async function sealAndSend(
  wallet: LegacyWalletPort | null,
  input: SealInput,
  options: SealOptions,
): Promise<SealResult> {
  const checked = validateSeal(input, options.nowMs)
  if (!checked.ok) return { ok: false, reason: 'invalid', errors: checked.errors }
  if (wallet === null) return { ok: false, reason: 'wallet-unavailable' }
  const { recipient, letter, amountZat, unlockMs } = checked.value

  let gift: { seed: string; address: string } | undefined
  let sealed
  try {
    gift = amountZat === null ? undefined : await wallet.createGiftWallet()
    sealed = await sealTimelocked({
      content: { letter, ...(gift === undefined ? {} : { giftSeed: gift.seed }) },
      unlockMs,
      nowMs: options.nowMs,
      ...(options.client === undefined ? {} : { client: options.client }),
    })
  } catch {
    return { ok: false, reason: 'seal-failed' }
  }

  const memos = bundleToMemos(sealed.bundle)
  const item: SentItem = {
    id: toHex(sealed.bundleId),
    bundleIdHex: toHex(sealed.bundleId),
    recipient,
    unlockMs,
    createdAtMs: options.nowMs,
    amountZat,
    status: 'sent',
  }

  if (gift !== undefined && amountZat !== null) {
    try {
      await wallet.fundGiftWallet(gift.address, amountZat)
    } catch {
      return { ok: false, reason: 'funding-failed' }
    }
  }

  try {
    await wallet.sendMemos({ to: recipient, memos })
  } catch {
    return {
      ok: false,
      reason: 'delivery-failed',
      item: {
        ...item,
        status: 'failed',
        memos,
        ...(gift === undefined ? {} : { giftSeed: gift.seed }),
      },
    }
  }
  return { ok: true, item }
}

/** Sends the memos of a failed item again. On success the retry data (including the seed) is dropped. */
export async function retryDelivery(
  wallet: LegacyWalletPort,
  item: SentItem,
): Promise<SentItem | null> {
  if (item.memos === undefined) return null
  try {
    await wallet.sendMemos({ to: item.recipient, memos: item.memos })
  } catch {
    return null
  }
  return {
    id: item.id,
    bundleIdHex: item.bundleIdHex,
    recipient: item.recipient,
    unlockMs: item.unlockMs,
    createdAtMs: item.createdAtMs,
    amountZat: item.amountZat,
    status: 'sent',
  }
}
