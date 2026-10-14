import { newPot, todayString, validatePotInput, type PotInput, type PotInputField } from './pot.ts'
import type { Pot } from './types.ts'
import type { PotWalletPort } from './walletPort.ts'

export type CreatePotResult =
  | { ok: true; pot: Pot }
  | { ok: false; reason: 'invalid'; errors: Partial<Record<PotInputField, string>> }
  | { ok: false; reason: 'wallet-unavailable' }
  | { ok: false; reason: 'wallet-error' }

/** Validates, then asks the wallet for a dedicated account. Nothing is created if either fails. */
export async function createPot(
  wallet: PotWalletPort | null,
  input: PotInput,
  options: { nowMs: number; batchIntervalMs: number },
): Promise<CreatePotResult> {
  const checked = validatePotInput(input, todayString(options.nowMs))
  if (!checked.ok) return { ok: false, reason: 'invalid', errors: checked.errors }
  if (wallet === null) return { ok: false, reason: 'wallet-unavailable' }
  try {
    const account = await wallet.createPotAccount(checked.value.name)
    return { ok: true, pot: newPot(checked.value, account, options) }
  } catch {
    return { ok: false, reason: 'wallet-error' }
  }
}

/** Withdraws everything to the main account, then reports the transaction id. */
export async function closePot(
  wallet: PotWalletPort,
  pot: Pot,
): Promise<{ ok: true; txid: string } | { ok: false }> {
  try {
    const { txid } = await wallet.withdrawAll(pot.accountId)
    return { ok: true, txid }
  } catch {
    return { ok: false }
  }
}
