import {
  POT_DENOMINATIONS_ZAT,
  POT_MAX_PIECES,
  POT_WISH_PIECE_ZAT,
} from '../../config/constants.ts'

/** Every denomination is a multiple of the smallest one, so amounts move in these steps. */
const UNIT = POT_WISH_PIECE_ZAT
const DESCENDING = [...POT_DENOMINATIONS_ZAT].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
const LARGEST = DESCENDING[0] ?? UNIT
const SEARCH_LIMIT = 200_000

export interface Piece {
  zat: bigint
  /** The wish travels with this piece. */
  carriesWish: boolean
}

export type SplitResult =
  | {
      ok: true
      pieces: Piece[]
      /** What will actually be sent. */
      totalZat: bigint
      requestedZat: bigint
      /** The total differs from what was asked for, so the person must be told. */
      adjusted: boolean
      /** The request was above the most a single gift can be. */
      capped: boolean
    }
  | { ok: false; reason: 'too-small' }

/** Largest total one gift can have: the maximum pieces, all of the largest denomination. */
export function maxGiftZat(withWish: boolean): bigint {
  return withWish ? BigInt(POT_MAX_PIECES - 1) * LARGEST + UNIT : BigInt(POT_MAX_PIECES) * LARGEST
}

/** Greedy split into standard denominations. Optimal for the 1-2-5 series. `zat` must be a multiple of UNIT. */
function greedy(zat: bigint): bigint[] {
  const pieces: bigint[] = []
  let remaining = zat
  for (const denomination of DESCENDING) {
    while (remaining >= denomination) {
      pieces.push(denomination)
      remaining -= denomination
    }
  }
  return pieces
}

/**
 * The amount closest to `target` that fits in `maxPieces` standard pieces. On a tie it picks the
 * lower one, so a gift is never rounded up when it does not have to be.
 */
function nearestRepresentable(target: bigint, maxPieces: number, allowZero: boolean): bigint {
  const fits = (zat: bigint) => (zat === 0n ? allowZero : greedy(zat).length <= maxPieces)
  const startUnits = target / UNIT

  let lower: bigint | undefined
  for (let i = 0n, units = startUnits; units >= 0n && i < SEARCH_LIMIT; i++, units--) {
    if (fits(units * UNIT)) {
      lower = units * UNIT
      break
    }
  }
  let upper: bigint | undefined
  for (let i = 0n, units = startUnits + 1n; i < SEARCH_LIMIT; i++, units++) {
    if (units * UNIT > maxGiftZat(false)) break
    if (fits(units * UNIT)) {
      upper = units * UNIT
      break
    }
  }

  if (lower === undefined) return upper ?? 0n
  if (upper === undefined) return lower
  return upper - target < target - lower ? upper : lower
}

/**
 * Splits a gift into standard pieces (section 3.2). Each piece is sent as its own transaction.
 * If there is a wish, one 0.001 piece is reserved for it so it travels with the most common
 * amount; the rest is rounded to the nearest amount that fits in the remaining pieces. The
 * caller must show `totalZat` to the person before anything is sent.
 */
export function splitContribution(requestedZat: bigint, withWish: boolean): SplitResult {
  if (requestedZat < UNIT) return { ok: false, reason: 'too-small' }

  const max = maxGiftZat(withWish)
  const capped = requestedZat > max
  const target = capped ? max : requestedZat

  let pieces: Piece[]
  if (withWish) {
    const rest = nearestRepresentable(target - UNIT, POT_MAX_PIECES - 1, true)
    pieces = [
      ...greedy(rest).map((zat) => ({ zat, carriesWish: false })),
      { zat: UNIT, carriesWish: true },
    ]
  } else {
    pieces = greedy(nearestRepresentable(target, POT_MAX_PIECES, false)).map((zat) => ({
      zat,
      carriesWish: false,
    }))
  }

  const totalZat = pieces.reduce((sum, piece) => sum + piece.zat, 0n)
  return { ok: true, pieces, totalZat, requestedZat, adjusted: totalZat !== requestedZat, capped }
}
