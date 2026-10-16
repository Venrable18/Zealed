import { decodeBundle, openWithShares, type LegacyContent } from '../../../crypto/bundle.ts'
import { toHex } from '../../../crypto/bytes.ts'
import { CryptoError } from '../../../crypto/errors.ts'
import { inspectShare } from '../../../crypto/shamir.ts'
import { createInbox } from '../../../zmp/index.ts'
import { decodeRelease } from './messages.ts'

const MAX_SHARES = 12

/** A letter the heir is waiting to be able to open. */
export interface HeirItem {
  bundleIdHex: string
  bundle: Uint8Array
  threshold: number
  total: number
  /** Distinct shares received from guardians so far. */
  shares: Uint8Array[]
  receivedAtMs: number
}

/** How many different shares have arrived. */
export function shareCount(item: HeirItem): number {
  return new Set(item.shares.map((share) => inspectShare(share)?.index)).size
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i])

/**
 * Finds guardian-mode letters and the shares guardians have released for them. Shares are matched
 * to letters by bundle ID and must agree with the letter's threshold and total. Anyone can send a
 * share to the heir, so what arrives is not trusted until it opens the letter.
 */
export async function ingestForHeir(
  items: readonly HeirItem[],
  memos: Uint8Array[],
  nowMs: number,
): Promise<HeirItem[]> {
  const bundles: Uint8Array[] = []
  const releases: Uint8Array[] = []
  const inbox = createInbox({
    SEALED_BUNDLE: (m) => void bundles.push(m.payload),
    SHARE_RELEASE: (m) => void releases.push(m.payload),
  })
  for (const memo of memos) await inbox.ingest(memo)

  const byId = new Map(
    items.map((item) => [item.bundleIdHex, { ...item, shares: [...item.shares] }]),
  )
  for (const payload of bundles) {
    const bundle = decodeBundle(payload)
    if (bundle?.mode !== 'guardians') continue
    const id = toHex(bundle.bundleId)
    if (byId.has(id)) continue
    byId.set(id, {
      bundleIdHex: id,
      bundle: payload,
      threshold: bundle.policy.threshold,
      total: bundle.policy.total,
      shares: [],
      receivedAtMs: nowMs,
    })
  }
  for (const payload of releases) {
    const release = decodeRelease(payload)
    const item = release === null ? undefined : byId.get(toHex(release.bundleId))
    if (release === null || item === undefined) continue
    const info = inspectShare(release.share)
    if (info?.threshold !== item.threshold || info.total !== item.total) continue
    if (
      item.shares.length >= MAX_SHARES ||
      item.shares.some((share) => sameBytes(share, release.share))
    )
      continue
    item.shares.push(release.share)
  }
  return [...byId.values()]
}

export type GuardedOpenResult =
  | { ok: true; content: LegacyContent }
  /** Fewer shares than the threshold have arrived. */
  | { ok: false; reason: 'waiting' }
  /** Enough shares arrived but none of the groups opens the letter: some are wrong. */
  | { ok: false; reason: 'mismatch' }
  | { ok: false; reason: 'damaged' }

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]]
  const result: T[][] = []
  items.forEach((item, index) => {
    for (const rest of combinations(items.slice(index + 1), size - 1)) result.push([item, ...rest])
  })
  return result
}

/**
 * Opens the letter once enough shares have arrived. Because a bogus share could be mixed in with
 * real ones, every group of `threshold` shares is tried until one matches the letter's key
 * commitment. With at most 12 shares and a threshold of 2 to 5 this is a small, bounded search.
 */
export async function openGuarded(item: HeirItem): Promise<GuardedOpenResult> {
  if (shareCount(item) < item.threshold) return { ok: false, reason: 'waiting' }
  for (const group of combinations(item.shares, item.threshold)) {
    try {
      return { ok: true, content: await openWithShares(item.bundle, group) }
    } catch (error) {
      if (
        error instanceof CryptoError &&
        (error.code === 'wrong-key' ||
          error.code === 'bad-share' ||
          error.code === 'insufficient-shares')
      )
        continue
      return { ok: false, reason: 'damaged' }
    }
  }
  return { ok: false, reason: 'mismatch' }
}
