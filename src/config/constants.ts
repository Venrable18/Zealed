/** Protocol and product constants. Amounts are in zatoshis (1 ZEC = 10^8 zatoshis). */

export const ZATOSHIS_PER_ZEC = 100_000_000n

/** Size of one Zcash memo field in bytes (ZIP 302). */
export const MEMO_BYTES = 512

/**
 * Blind Pot standard denominations, a 1-2-5 series from 0.001 to 10 ZEC, ascending.
 * Contributions are split into these pieces so individual gifts cannot be picked out.
 */
export const POT_DENOMINATIONS_ZAT: readonly bigint[] = [
  100_000n, // 0.001
  200_000n, // 0.002
  500_000n, // 0.005
  1_000_000n, // 0.01
  2_000_000n, // 0.02
  5_000_000n, // 0.05
  10_000_000n, // 0.1
  20_000_000n, // 0.2
  50_000_000n, // 0.5
  100_000_000n, // 1
  200_000_000n, // 2
  500_000_000n, // 5
  1_000_000_000n, // 10
]

/** A contribution is split into at most this many pieces. */
export const POT_MAX_PIECES = 6

/** The wish travels with the smallest (most common) piece. */
export const POT_WISH_PIECE_ZAT = 100_000n

export const WISH_MAX_CHARS = 140
export const LEGACY_LETTER_MAX_BYTES = 2048
export const UNSIGNED_MESSAGE_MAX_BYTES = 2048

/** Legacy Mode B guardian set: 2 to 5 guardians, default 2-of-3. */
export const GUARDIANS_MIN = 2
export const GUARDIANS_MAX = 5
export const DEFAULT_GUARDIANS = 3
export const DEFAULT_GUARDIAN_THRESHOLD = 2
