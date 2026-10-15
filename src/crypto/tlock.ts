import {
  Buffer,
  defaultChainInfo,
  mainnetClient,
  timelockDecrypt,
  timelockEncrypt,
  type ChainClient,
  type ChainInfo,
} from 'tlock-js'
import { DRAND } from '../config/network.ts'
import { CryptoError } from './errors.ts'

/**
 * Timelock encryption to drand quicknet. A key locked to round R cannot be opened by anyone
 * until the drand network publishes round R, however long the ciphertext has been around.
 */

/** The chain info compiled into tlock-js. A test checks it matches `DRAND` in config. */
export const QUICKNET: Readonly<ChainInfo> = defaultChainInfo

/**
 * A client pinned to quicknet on the one drand host the CSP allows. tlock-js verifies every
 * beacon against the chain's public key, so a bad host cannot forge one.
 */
export function quicknetClient(): ChainClient {
  return mainnetClient()
}

/** When round `round` is published (Unix ms). Round 1 is the genesis time. */
export function timeOfRound(round: number, info: ChainInfo = QUICKNET): number {
  return info.genesis_time * 1000 + (round - 1) * info.period * 1000
}

/**
 * The first round published at or after `unlockMs`, so a key is never openable before the chosen
 * time. Throws RangeError for a time before the chain began.
 */
export function roundForUnlock(unlockMs: number, info: ChainInfo = QUICKNET): number {
  const genesisMs = info.genesis_time * 1000
  if (!Number.isFinite(unlockMs) || unlockMs < genesisMs)
    throw new RangeError('unlock time is before the chain began')
  return Math.ceil((unlockMs - genesisMs) / (info.period * 1000)) + 1
}

export interface LockedKey {
  round: number
  /** The age-armored timelock ciphertext, as UTF-8 bytes. */
  ciphertext: Uint8Array
}

/** Locks `key` until the round for `unlockMs`. Needs the chain info, so it may fetch it once. */
export async function lockKey(
  key: Uint8Array,
  unlockMs: number,
  client: ChainClient = quicknetClient(),
): Promise<LockedKey> {
  const info = await client.chain().info()
  const round = roundForUnlock(unlockMs, info)
  try {
    const armored = await timelockEncrypt(round, Buffer.from(key), client)
    return { round, ciphertext: new TextEncoder().encode(armored) }
  } catch {
    throw new CryptoError('invalid-input')
  }
}

/**
 * Opens a locked key. Throws CryptoError('not-yet') if the round's time has not come (checked
 * against `nowMs`, but the real gate is cryptographic: the network cannot give out the beacon
 * early), and CryptoError('unlock-failed') if the beacon could not be fetched or the data is not
 * a valid timelock ciphertext for this chain.
 */
export async function unlockKey(
  locked: LockedKey,
  options: { client?: ChainClient; nowMs?: number } = {},
): Promise<Uint8Array> {
  const client = options.client ?? quicknetClient()
  const nowMs = options.nowMs ?? Date.now()
  const info = await client.chain().info()
  if (nowMs < timeOfRound(locked.round, info)) throw new CryptoError('not-yet')
  try {
    const key = await timelockDecrypt(new TextDecoder().decode(locked.ciphertext), client)
    return new Uint8Array(key)
  } catch {
    throw new CryptoError('unlock-failed')
  }
}

/** Where the DRAND config and the compiled-in chain must agree. */
export function chainMatchesConfig(info: ChainInfo = QUICKNET): boolean {
  return info.hash === DRAND.chainHash
}
