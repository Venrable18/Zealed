import type { ChainClient } from 'tlock-js'
import { decodeBundle, openTimelocked, type LegacyContent } from '../../crypto/bundle.ts'
import { toHex } from '../../crypto/bytes.ts'
import { CryptoError } from '../../crypto/errors.ts'
import { timeOfRound } from '../../crypto/tlock.ts'
import { createInbox } from '../../zmp/index.ts'
import type { InboxItem } from './types.ts'
import type { LegacyWalletPort, SweepResult } from './walletPort.ts'

/**
 * Finds sealed letters in received memos. Memos that are not Zealed messages, other message types
 * and bundles that are not timelock letters are ignored. Each letter is returned once.
 */
export async function findSealedLetters(memos: Uint8Array[], nowMs: number): Promise<InboxItem[]> {
  const found = new Map<string, InboxItem>()
  const inbox = createInbox({
    SEALED_BUNDLE: (message) => {
      const bundle = decodeBundle(message.payload)
      if (bundle?.mode !== 'timelock') return
      const bundleIdHex = toHex(bundle.bundleId)
      if (found.has(bundleIdHex)) return
      found.set(bundleIdHex, {
        bundleIdHex,
        bundle: message.payload,
        unlockMs: timeOfRound(bundle.round),
        receivedAtMs: nowMs,
      })
    },
  })
  for (const memo of memos) await inbox.ingest(memo)
  return [...found.values()]
}

export type OpenResult =
  | { ok: true; content: LegacyContent }
  /** Before the unlock time. Nothing was tried. */
  | { ok: false; reason: 'not-yet' }
  /** Time has come but the drand network could not give the key. Try again. */
  | { ok: false; reason: 'unavailable' }
  /** The letter is damaged and cannot be opened. */
  | { ok: false; reason: 'damaged' }

export async function openLetter(
  item: InboxItem,
  options: { client?: ChainClient; nowMs?: number } = {},
): Promise<OpenResult> {
  try {
    return { ok: true, content: await openTimelocked(item.bundle, options) }
  } catch (error) {
    if (error instanceof CryptoError) {
      if (error.code === 'not-yet') return { ok: false, reason: 'not-yet' }
      if (error.code === 'unlock-failed') return { ok: false, reason: 'unavailable' }
    }
    return { ok: false, reason: 'damaged' }
  }
}

/** Moves a gift into the recipient's wallet. Never throws; a thrown wallet error becomes 'failed'. */
export async function sweepGift(wallet: LegacyWalletPort, seed: string): Promise<SweepResult> {
  try {
    return await wallet.sweepGiftWallet(seed)
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
