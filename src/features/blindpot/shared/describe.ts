import type { SigningRequest } from './port.ts'

export interface WithdrawalSummary {
  /** `all`: nothing comes back to the pot. `part`: some stays in it. */
  kind: 'all' | 'part'
  /** Zatoshis that leave the pot for other addresses. */
  paidZat: bigint
  /** Zatoshis that return to the pot as change (zero for a full withdrawal). */
  staysZat: bigint
}

/**
 * What a withdrawal takes, read from the transaction's own outputs, so a co-host sees the same
 * thing the host chose and cannot be told otherwise: an output back to the pot means part of the
 * pot stays in it, and no such output means everything leaves.
 */
export function summarizeWithdrawal(
  outputs: SigningRequest['outputs'],
  potAddress: string | undefined,
): WithdrawalSummary {
  let paidZat = 0n
  let staysZat = 0n
  for (const output of outputs) {
    const zat = output.zat === undefined ? 0n : BigInt(output.zat)
    if (potAddress !== undefined && output.address === potAddress) staysZat += zat
    else paidZat += zat
  }
  return { kind: staysZat > 0n ? 'part' : 'all', paidZat, staysZat }
}
