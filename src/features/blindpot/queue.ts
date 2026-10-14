import type { SharedPot } from './shareLink.ts'
import type { SplitResult } from './splitter.ts'
import type { ContributorWalletPort } from './contributorWallet.ts'
import { encodeWishMemo } from './wishMemo.ts'

export type PieceStatus = 'pending' | 'sending' | 'sent' | 'blocked' | 'failed'

export interface QueuedPiece {
  zat: bigint
  /** The wish text this piece carries, if any. */
  wish?: string
  status: PieceStatus
  /** Unix ms. Not sent before this, so pieces are spread out in time. */
  notBeforeMs: number
  attempts: number
  txid?: string
}

/** One guest's gift: an ordered list of pieces, each sent as its own transaction. */
export interface Contribution {
  id: string
  potId: string
  address: string
  createdAtMs: number
  pieces: QueuedPiece[]
}

export interface DelayRange {
  min: number
  max: number
}

export const MAX_ATTEMPTS = 3
/** Wait before trying again after a failure or when funds are not spendable yet. */
export const RETRY_DELAY_MS = 30_000

export type Random = () => number

/** Uniform random in [0, 1) from the browser's secure generator. */
export function secureRandom(): number {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1))
  return value / 4294967296
}

function randomBetween(range: DelayRange, random: Random): number {
  return Math.floor(range.min + random() * (range.max - range.min + 1))
}

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = result[i] as T
    result[i] = result[j] as T
    result[j] = a
  }
  return result
}

/**
 * Builds the queue for a gift. The order is shuffled, so the piece with the wish is not always
 * first or last. The first piece can go straight away; each later one waits a random extra time.
 */
export function createContribution(options: {
  pot: Pick<SharedPot, 'id' | 'address'>
  split: Extract<SplitResult, { ok: true }>
  wish: string | undefined
  nowMs: number
  delays: DelayRange
  random?: Random
}): Contribution {
  const random = options.random ?? secureRandom
  const ordered = shuffle(options.split.pieces, random)
  let notBeforeMs = options.nowMs
  const pieces = ordered.map((piece, index): QueuedPiece => {
    if (index > 0) notBeforeMs += randomBetween(options.delays, random)
    return {
      zat: piece.zat,
      ...(piece.carriesWish && options.wish !== undefined ? { wish: options.wish } : {}),
      status: 'pending',
      notBeforeMs,
      attempts: 0,
    }
  })
  return {
    id: Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join(''),
    potId: options.pot.id,
    address: options.pot.address,
    createdAtMs: options.nowMs,
    pieces,
  }
}

export type QueueState = 'running' | 'done' | 'blocked' | 'failed'

export function progress(contribution: Contribution): {
  sent: number
  total: number
  state: QueueState
} {
  const total = contribution.pieces.length
  const sent = contribution.pieces.filter((p) => p.status === 'sent').length
  let state: QueueState = 'running'
  if (sent === total) state = 'done'
  else if (contribution.pieces.some((p) => p.status === 'failed')) state = 'failed'
  else if (contribution.pieces.some((p) => p.status === 'blocked')) state = 'blocked'
  return { sent, total, state }
}

/** What the guest sees afterwards: only their own gift, never the pot. */
export function receipt(contribution: Contribution): {
  pieces: number
  totalZat: bigint
  wish: string | undefined
} {
  const sent = contribution.pieces.filter((p) => p.status === 'sent')
  return {
    pieces: sent.length,
    totalZat: sent.reduce((sum, p) => sum + p.zat, 0n),
    wish: contribution.pieces.find((p) => p.wish !== undefined)?.wish,
  }
}

/** Index of the piece to send now, or -1. Strictly one at a time and in order. */
export function nextDue(contribution: Contribution, nowMs: number): number {
  if (contribution.pieces.some((p) => p.status === 'sending')) return -1
  const index = contribution.pieces.findIndex((p) => p.status !== 'sent')
  const piece = contribution.pieces[index]
  return piece?.status === 'pending' && piece.notBeforeMs <= nowMs ? index : -1
}

function update(
  contribution: Contribution,
  index: number,
  change: Partial<QueuedPiece>,
): Contribution {
  return {
    ...contribution,
    pieces: contribution.pieces.map((piece, i) => (i === index ? { ...piece, ...change } : piece)),
  }
}

/** After a transient failure, put the rest of the queue back by at least `RETRY_DELAY_MS`. */
function retryLater(
  contribution: Contribution,
  index: number,
  nowMs: number,
  countAttempt: boolean,
): Contribution {
  const piece = contribution.pieces[index]
  if (piece === undefined) return contribution
  const attempts = piece.attempts + (countAttempt ? 1 : 0)
  if (attempts >= MAX_ATTEMPTS) return update(contribution, index, { status: 'failed', attempts })
  return update(contribution, index, {
    status: 'pending',
    attempts,
    notBeforeMs: nowMs + RETRY_DELAY_MS,
  })
}

/**
 * Sends the next due piece, if any, and returns the updated queue. Call it on a timer. A piece
 * the wallet cannot spend yet is retried without counting as a failure; running out of funds
 * pauses the queue; other failures are retried up to `MAX_ATTEMPTS` times.
 */
export async function runStep(
  contribution: Contribution,
  wallet: ContributorWalletPort,
  nowMs: number,
): Promise<Contribution> {
  const index = nextDue(contribution, nowMs)
  const piece = contribution.pieces[index]
  if (piece === undefined) return contribution

  let memo: Uint8Array | undefined
  if (piece.wish !== undefined) {
    const encoded = encodeWishMemo(piece.wish)
    if (!encoded.ok) return update(contribution, index, { status: 'failed' })
    memo = encoded.memo
  }

  let result
  try {
    result = await wallet.sendPiece({
      address: contribution.address,
      zat: piece.zat,
      ...(memo === undefined ? {} : { memo }),
    })
  } catch {
    return retryLater(contribution, index, nowMs, true)
  }

  if (result.ok) return update(contribution, index, { status: 'sent', txid: result.txid })
  if (result.reason === 'not-spendable-yet') return retryLater(contribution, index, nowMs, false)
  if (result.reason === 'insufficient-funds')
    return update(contribution, index, { status: 'blocked' })
  return retryLater(contribution, index, nowMs, true)
}

/** Lets the guest continue after adding funds (blocked) or retry after repeated failures (failed). */
export function resume(contribution: Contribution, nowMs: number): Contribution {
  return {
    ...contribution,
    pieces: contribution.pieces.map((p) =>
      p.status === 'blocked' || p.status === 'failed'
        ? { ...p, status: 'pending', attempts: 0, notBeforeMs: nowMs }
        : p,
    ),
  }
}
