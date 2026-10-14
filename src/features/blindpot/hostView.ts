import { createInbox } from '../../zmp/index.ts'
import { batchWindow } from './batching.ts'
import { privacyStrength } from './strength.ts'
import type { HostView, Pot } from './types.ts'
import type { PotWalletPort } from './walletPort.ts'
import { decodeWish, seededShuffle } from './wishes.ts'

/**
 * Builds what the host may see: the total as of the last batch boundary, a privacy strength, and
 * shuffled wishes. Reads the wallet as of the boundary rather than now, so the result is the
 * same every time it is opened within a batch, and gifts that arrived later are not visible.
 */
export async function buildHostView(
  wallet: PotWalletPort,
  pot: Pot,
  nowMs: number,
): Promise<HostView> {
  const { lastMs, nextMs } = batchWindow(nowMs, pot.createdAtMs, pot.batchIntervalMs)
  const [totalZat, pieces, memos] = await Promise.all([
    wallet.balanceAsOf(pot.accountId, lastMs),
    wallet.piecesAsOf(pot.accountId, lastMs),
    wallet.memosAsOf(pot.accountId, lastMs),
  ])

  const wishes: string[] = []
  const inbox = createInbox({
    WISH: (message) => {
      const wish = decodeWish(message.payload)
      if (wish !== null) wishes.push(wish)
    },
  })
  for (const memo of memos) await inbox.ingest(memo)

  return {
    totalZat,
    strength: privacyStrength(pieces),
    wishes: seededShuffle(wishes, `${pot.id}:${String(lastMs)}`),
    asOfMs: lastMs,
    nextUpdateMs: nextMs,
  }
}
