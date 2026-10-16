import type { LegacyWalletPort } from '../walletPort.ts'
import { ingestForGuardian, type GuardianEvent, type GuardianRecord } from './guardian.ts'
import { ingestForHeir, type HeirItem } from './heir.ts'
import { ingestForOwner, type OwnerRecord } from './owner.ts'

export interface IncomingResult {
  guardians: GuardianRecord[]
  owned: OwnerRecord[]
  heirs: HeirItem[]
  events: GuardianEvent[]
}

/** Reads the wallet's received memos once and updates what each role knows. */
export async function checkIncoming(
  wallet: LegacyWalletPort,
  state: {
    guardians: readonly GuardianRecord[]
    owned: readonly OwnerRecord[]
    heirs: readonly HeirItem[]
  },
  nowMs: number,
): Promise<IncomingResult> {
  const memos = await wallet.receivedMemos()
  const guardian = await ingestForGuardian(state.guardians, memos, nowMs)
  return {
    guardians: guardian.records,
    events: guardian.events,
    owned: await ingestForOwner(state.owned, memos),
    heirs: await ingestForHeir(state.heirs, memos, nowMs),
  }
}
