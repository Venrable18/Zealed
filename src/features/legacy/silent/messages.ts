import { BUNDLE_ID_BYTES } from '../../../crypto/sign.ts'
import { decodePolicy, encodePolicy, type Policy } from '../../../crypto/bundle.ts'
import { concat } from '../../../crypto/bytes.ts'
import { inspectShare } from '../../../crypto/shamir.ts'
import { encodeChunk, splitMessage, type MessageType } from '../../../zmp/index.ts'
import { looksLikeAddress } from '../validate.ts'

/** Splits one message into the memos that carry it. */
export function toMemos(type: MessageType, payload: Uint8Array): Uint8Array[] {
  return splitMessage(type, payload).map(encodeChunk)
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value >> 8, value & 0xff])
}

/** Reads length-prefixed fields. Returns null if the bytes do not match exactly. */
function readFields(bytes: Uint8Array, count: number): Uint8Array[] | null {
  const fields: Uint8Array[] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    if (at + 2 > bytes.length) return null
    const length = ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
    at += 2
    if (at + length > bytes.length) return null
    fields.push(bytes.slice(at, at + length))
    at += length
  }
  return at === bytes.length ? fields : null
}

// --- SHARE: owner to guardian -----------------------------------------------------------------

export interface ShareMessage {
  policy: Policy
  /** One Shamir share of the content key. */
  share: Uint8Array
  /** Where a guardian sends reminders. Sender addresses are hidden in Zcash, so it must be told. */
  ownerAddress: string
}

export function encodeShareMessage(message: ShareMessage): Uint8Array {
  const policy = encodePolicy(message.policy)
  const owner = new TextEncoder().encode(message.ownerAddress)
  return concat(
    u16(policy.length),
    policy,
    u16(message.share.length),
    message.share,
    u16(owner.length),
    owner,
  )
}

/** Reads untrusted bytes. Returns null unless the policy, share and address all agree. Never throws. */
export function decodeShareMessage(bytes: Uint8Array): ShareMessage | null {
  try {
    const fields = readFields(bytes, 3)
    const [policyBytes, share, ownerBytes] = fields ?? []
    if (policyBytes === undefined || share === undefined || ownerBytes === undefined) return null
    const policy = decodePolicy(policyBytes)
    const info = inspectShare(share)
    if (policy === null || info === null) return null
    if (info.threshold !== policy.threshold || info.total !== policy.total) return null
    const ownerAddress = new TextDecoder('utf-8', { fatal: true }).decode(ownerBytes)
    return looksLikeAddress(ownerAddress) ? { policy, share, ownerAddress } : null
  } catch {
    return null
  }
}

// --- SHARE_RELEASE: guardian to heir ----------------------------------------------------------

export interface ReleaseMessage {
  bundleId: Uint8Array
  share: Uint8Array
}

export function encodeRelease(message: ReleaseMessage): Uint8Array {
  return concat(message.bundleId, message.share)
}

export function decodeRelease(bytes: Uint8Array): ReleaseMessage | null {
  if (bytes.length <= BUNDLE_ID_BYTES) return null
  const share = bytes.slice(BUNDLE_ID_BYTES)
  return inspectShare(share) === null ? null : { bundleId: bytes.slice(0, BUNDLE_ID_BYTES), share }
}

// --- NUDGE: guardian to owner -----------------------------------------------------------------

export function encodeNudge(bundleId: Uint8Array): Uint8Array {
  return bundleId.slice()
}

export function decodeNudge(bytes: Uint8Array): Uint8Array | null {
  return bytes.length === BUNDLE_ID_BYTES ? bytes.slice() : null
}
