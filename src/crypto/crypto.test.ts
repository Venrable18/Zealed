import { describe, expect, it } from 'vitest'
import { DRAND } from '../config/network.ts'
import {
  AES_OVERHEAD_BYTES,
  KEY_BYTES,
  decrypt,
  encrypt,
  generateKey,
  keyCommitment,
} from './aes.ts'
import {
  decodeBundle,
  decodeContent,
  decodePolicy,
  encodeBundle,
  encodeContent,
  encodePolicy,
  openTimelocked,
  openWithShares,
  sealForGuardians,
  sealTimelocked,
  type LegacyContent,
} from './bundle.ts'
import { CryptoError } from './errors.ts'
import { combineShares, splitSecret } from './shamir.ts'
import {
  CheckInTracker,
  MAX_CLOCK_SKEW_MS,
  generateKeypair,
  signCheckIn,
  signRevoke,
  verifyCheckIn,
  verifyRevoke,
} from './sign.ts'
import { FIXTURE_ROUNDS, fixtureClient } from './testClient.ts'
import {
  QUICKNET,
  chainMatchesConfig,
  lockKey,
  roundForUnlock,
  timeOfRound,
  unlockKey,
} from './tlock.ts'

const bytes = (text: string) => new TextEncoder().encode(text)
const text = (data: Uint8Array) => new TextDecoder().decode(data)
const ADDRESS = 'utest1fakeaddressfakeaddressfakeaddress'

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function failsWith(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'CryptoError', code })
}

describe('aes (AES-256-GCM)', () => {
  it('round-trips, with a 12-byte IV and 16-byte tag added', async () => {
    const key = generateKey()
    expect(key).toHaveLength(KEY_BYTES)
    const sealed = await encrypt(key, bytes('dear Ada'))
    expect(sealed).toHaveLength(8 + AES_OVERHEAD_BYTES)
    expect(text(await decrypt(key, sealed))).toBe('dear Ada')
    expect(await decrypt(key, await encrypt(key, new Uint8Array(0)))).toHaveLength(0)
  })

  it('uses a new IV every time, so the same text encrypts differently', async () => {
    const key = generateKey()
    const a = await encrypt(key, bytes('same'))
    const b = await encrypt(key, bytes('same'))
    expect(a).not.toEqual(b)
  })

  it('fails with the wrong key', async () => {
    const sealed = await encrypt(generateKey(), bytes('secret'))
    await failsWith(decrypt(generateKey(), sealed), 'decrypt-failed')
  })

  it('fails if any byte is changed, or the data is cut short', async () => {
    const key = generateKey()
    const sealed = await encrypt(key, bytes('a letter'))
    for (const index of [0, 11, 12, sealed.length - 1]) {
      const tampered = sealed.slice()
      tampered[index] = (tampered[index] ?? 0) ^ 1
      await failsWith(decrypt(key, tampered), 'decrypt-failed')
    }
    await failsWith(decrypt(key, sealed.slice(0, 20)), 'decrypt-failed')
    await failsWith(decrypt(key, new Uint8Array(3)), 'decrypt-failed')
  })

  it('binds the context: the wrong associated data fails', async () => {
    const key = generateKey()
    const sealed = await encrypt(key, bytes('x'), bytes('bundle-1'))
    expect(text(await decrypt(key, sealed, bytes('bundle-1')))).toBe('x')
    await failsWith(decrypt(key, sealed, bytes('bundle-2')), 'decrypt-failed')
    await failsWith(decrypt(key, sealed), 'decrypt-failed')
  })

  it('refuses a key of the wrong size', async () => {
    await failsWith(encrypt(new Uint8Array(16), bytes('x')), 'invalid-input')
    await failsWith(decrypt(new Uint8Array(31), new Uint8Array(40)), 'invalid-input')
  })

  it('commits to a key without revealing it', async () => {
    const key = generateKey()
    const commitment = await keyCommitment(key)
    expect(commitment).toHaveLength(32)
    expect(await keyCommitment(key)).toEqual(commitment)
    expect(await keyCommitment(generateKey())).not.toEqual(commitment)
  })

  it('error messages never contain secrets', async () => {
    const key = generateKey()
    try {
      await decrypt(key, bytes('x'.repeat(40)))
    } catch (error) {
      expect(error).toBeInstanceOf(CryptoError)
      expect((error as Error).message).toBe('decrypt-failed')
    }
  })
})

describe('shamir', () => {
  it('rebuilds the secret from any threshold-sized group of shares', async () => {
    const secret = generateKey()
    const shares = await splitSecret(secret, 5, 3)
    expect(shares).toHaveLength(5)
    for (const group of [
      [0, 1, 2],
      [2, 3, 4],
      [0, 2, 4],
      [4, 1, 3],
    ]) {
      expect(await combineShares(group.map((i) => shares[i]!))).toEqual(secret)
    }
    expect(await combineShares(shares)).toEqual(secret)
  })

  it('supports every allowed total and threshold', async () => {
    for (let total = 2; total <= 5; total++) {
      for (let threshold = 2; threshold <= total; threshold++) {
        const secret = generateKey()
        const shares = await splitSecret(secret, total, threshold)
        expect(await combineShares(shares.slice(0, threshold))).toEqual(secret)
      }
    }
  })

  it('refuses too few shares instead of returning a wrong key', async () => {
    const shares = await splitSecret(generateKey(), 3, 2)
    await failsWith(combineShares([shares[0]!]), 'insufficient-shares')
    await failsWith(combineShares([]), 'insufficient-shares')
    const five = await splitSecret(generateKey(), 5, 4)
    await failsWith(combineShares(five.slice(0, 3)), 'insufficient-shares')
  })

  it('refuses repeated, mismatched or malformed shares', async () => {
    const a = await splitSecret(generateKey(), 3, 2)
    const b = await splitSecret(generateKey(), 3, 2)
    const c = await splitSecret(generateKey(), 4, 3)
    await failsWith(combineShares([a[0]!, a[0]!]), 'bad-share')
    await failsWith(combineShares([a[0]!, c[1]!]), 'bad-share')
    await failsWith(combineShares([a[0]!, new Uint8Array(5)]), 'bad-share')
    // Shares from two different secrets are well-formed, so only a key commitment can catch them.
    const mixed = await combineShares([a[0]!, b[1]!])
    expect(mixed).toHaveLength(KEY_BYTES)
  })

  it('rejects settings outside the allowed range', async () => {
    const secret = generateKey()
    for (const [total, threshold] of [
      [1, 1],
      [6, 2],
      [3, 1],
      [3, 4],
      [2.5, 2],
    ] as const) {
      await failsWith(splitSecret(secret, total, threshold), 'invalid-input')
    }
    await failsWith(splitSecret(new Uint8Array(0), 3, 2), 'invalid-input')
  })

  it('does not leak the secret in any single share', async () => {
    const secret = generateKey()
    const shares = await splitSecret(secret, 3, 2)
    for (const share of shares)
      expect(Array.from(share).join()).not.toContain(Array.from(secret).join())
  })
})

describe('sign (Ed25519 check-ins)', () => {
  const bundleId = new Uint8Array(16).fill(7)
  const NOW = 1_800_000_000_000

  it('verifies a genuine check-in and returns its contents', () => {
    const { privateKey, publicKey } = generateKeypair()
    const sent = signCheckIn(privateKey, { bundleId, counter: 5, timestampMs: NOW })
    expect(verifyCheckIn(publicKey, sent)).toEqual({ bundleId, counter: 5, timestampMs: NOW })
  })

  it('rejects the wrong key, and any change to the message', () => {
    const owner = generateKeypair()
    const stranger = generateKeypair()
    const sent = signCheckIn(owner.privateKey, { bundleId, counter: 5, timestampMs: NOW })
    expect(verifyCheckIn(stranger.publicKey, sent)).toBeNull()
    for (let i = 0; i < sent.length; i += 7) {
      const tampered = sent.slice()
      tampered[i] = (tampered[i] ?? 0) ^ 1
      expect(verifyCheckIn(owner.publicKey, tampered)).toBeNull()
    }
    expect(verifyCheckIn(owner.publicKey, sent.slice(0, 50))).toBeNull()
    expect(verifyCheckIn(new Uint8Array(5), sent)).toBeNull()
  })

  it('does not accept a signature made for another purpose', () => {
    const owner = generateKeypair()
    const revoke = signRevoke(owner.privateKey, { bundleId, timestampMs: NOW })
    expect(verifyRevoke(owner.publicKey, revoke)).toEqual({ bundleId, timestampMs: NOW })
    // A revoke is shorter, but even a padded one fails: the signed domain differs.
    const padded = new Uint8Array(96)
    padded.set(revoke.slice(0, 24), 0)
    padded.set(revoke.slice(24), 32)
    expect(verifyCheckIn(owner.publicKey, padded)).toBeNull()
    const checkIn = signCheckIn(owner.privateKey, { bundleId, counter: 1, timestampMs: NOW })
    expect(verifyRevoke(owner.publicKey, checkIn)).toBeNull()
  })

  it('a guardian accepts rising counters and refuses replays and old counters', () => {
    const owner = generateKeypair()
    const tracker = new CheckInTracker(owner.publicKey, bundleId)
    const send = (counter: number) =>
      signCheckIn(owner.privateKey, { bundleId, counter, timestampMs: NOW })
    expect(tracker.lastCheckInMs).toBeNull()
    expect(tracker.accept(send(1), NOW).ok).toBe(true)
    expect(tracker.lastCheckInMs).toBe(NOW)
    expect(tracker.accept(send(1), NOW)).toEqual({ ok: false, reason: 'replayed' })
    expect(tracker.accept(send(0), NOW)).toEqual({ ok: false, reason: 'replayed' })
    expect(tracker.accept(send(5), NOW).ok).toBe(true)
    expect(tracker.accept(send(3), NOW)).toEqual({ ok: false, reason: 'replayed' })
  })

  it('a guardian refuses forged, wrong-bundle and future-dated check-ins, and a rejected one changes nothing', () => {
    const owner = generateKeypair()
    const tracker = new CheckInTracker(owner.publicKey, bundleId)
    const forged = signCheckIn(generateKeypair().privateKey, {
      bundleId,
      counter: 1,
      timestampMs: NOW,
    })
    expect(tracker.accept(forged, NOW)).toEqual({ ok: false, reason: 'invalid-signature' })
    const other = signCheckIn(owner.privateKey, {
      bundleId: new Uint8Array(16).fill(9),
      counter: 1,
      timestampMs: NOW,
    })
    expect(tracker.accept(other, NOW)).toEqual({ ok: false, reason: 'wrong-bundle' })
    const future = signCheckIn(owner.privateKey, {
      bundleId,
      counter: 1,
      timestampMs: NOW + MAX_CLOCK_SKEW_MS + 1000,
    })
    expect(tracker.accept(future, NOW)).toEqual({ ok: false, reason: 'from-the-future' })
    expect(tracker.lastCheckInMs).toBeNull()
    expect(
      tracker.accept(signCheckIn(owner.privateKey, { bundleId, counter: 1, timestampMs: NOW }), NOW)
        .ok,
    ).toBe(true)
  })

  it('refuses a bundle ID of the wrong size', () => {
    expect(() =>
      signCheckIn(generateKeypair().privateKey, {
        bundleId: new Uint8Array(4),
        counter: 1,
        timestampMs: 1,
      }),
    ).toThrow(RangeError)
  })
})

describe('tlock (drand quicknet, offline with real recorded beacons)', () => {
  const R1 = FIXTURE_ROUNDS[0] ?? 0
  const R2 = FIXTURE_ROUNDS[1] ?? 0

  it('uses the same chain as the app config', () => {
    expect(chainMatchesConfig()).toBe(true)
    expect(QUICKNET.hash).toBe(DRAND.chainHash)
    expect(QUICKNET.period).toBe(3)
  })

  it('converts between times and rounds, never opening before the chosen time', () => {
    const genesisMs = QUICKNET.genesis_time * 1000
    expect(timeOfRound(1)).toBe(genesisMs)
    expect(timeOfRound(11)).toBe(genesisMs + 30_000)
    expect(roundForUnlock(genesisMs)).toBe(1)
    expect(roundForUnlock(genesisMs + 1)).toBe(2)
    expect(roundForUnlock(genesisMs + 3000)).toBe(2)
    expect(roundForUnlock(genesisMs + 3001)).toBe(3)
    for (let i = 0; i < 200; i++) {
      const t = genesisMs + Math.floor(Math.random() * 10 ** 11)
      const round = roundForUnlock(t)
      expect(timeOfRound(round)).toBeGreaterThanOrEqual(t)
      expect(timeOfRound(round - 1)).toBeLessThan(t)
    }
    expect(() => roundForUnlock(genesisMs - 1)).toThrow(RangeError)
    expect(() => roundForUnlock(Number.NaN)).toThrow(RangeError)
  })

  it('works for short demo-mode delays (about 30 seconds is ten rounds)', () => {
    const now = timeOfRound(R1)
    expect(roundForUnlock(now + 30_000) - roundForUnlock(now)).toBe(10)
  })

  it('locks a key to a round and opens it once the round is published', async () => {
    const key = generateKey()
    const locked = await lockKey(key, timeOfRound(R1), fixtureClient())
    expect(locked.round).toBe(R1)
    const opened = await unlockKey(locked, {
      client: fixtureClient(),
      nowMs: timeOfRound(R1) + 1000,
    })
    expect(opened).toEqual(key)
  })

  it('will not open early: before the round time, and when the network has not published it', async () => {
    const locked = await lockKey(generateKey(), timeOfRound(R1), fixtureClient())
    await failsWith(
      unlockKey(locked, { client: fixtureClient(), nowMs: timeOfRound(R1) - 1 }),
      'not-yet',
    )
    // The clock says it is time, but the network has no such round (here: a round not in the fixture).
    const future = await lockKey(generateKey(), timeOfRound(R2 + 5000), fixtureClient())
    await failsWith(
      unlockKey(future, { client: fixtureClient(), nowMs: timeOfRound(R2 + 5000) + 1000 }),
      'unlock-failed',
    )
  })

  it('cannot be opened with the beacon of a different round', async () => {
    const locked = await lockKey(generateKey(), timeOfRound(R2), fixtureClient())
    const forged = fixtureClient({ swap: { [R2]: R1 } })
    await failsWith(
      unlockKey(locked, { client: forged, nowMs: timeOfRound(R2) + 1000 }),
      'unlock-failed',
    )
  })

  it('fails cleanly on garbage or a damaged ciphertext', async () => {
    const locked = await lockKey(generateKey(), timeOfRound(R1), fixtureClient())
    const opts = { client: fixtureClient(), nowMs: timeOfRound(R1) + 1000 }
    await failsWith(
      unlockKey({ round: R1, ciphertext: bytes('not a ciphertext') }, opts),
      'unlock-failed',
    )
    const damaged = locked.ciphertext.slice()
    damaged[Math.floor(damaged.length / 2)] = (damaged[Math.floor(damaged.length / 2)] ?? 0) ^ 0x55
    await failsWith(unlockKey({ round: R1, ciphertext: damaged }, opts), 'unlock-failed')
  })
})

describe('bundle format', () => {
  const content: LegacyContent = {
    letter: 'My dearest Ada,\nIf you are reading this…',
    giftSeed: 'abandon abandon abandon',
  }

  it('encodes and decodes content, enforcing the size limits', () => {
    expect(decodeContent(encodeContent(content))).toEqual(content)
    expect(decodeContent(encodeContent({ letter: 'hi' }))).toEqual({ letter: 'hi' })
    expect(() => encodeContent({ letter: 'x'.repeat(2049) })).toThrow(CryptoError)
    expect(() => encodeContent({ letter: 'ok', giftSeed: 'x'.repeat(401) })).toThrow(CryptoError)
    expect(() => decodeContent(bytes('{"v":2}'))).toThrow(CryptoError)
    expect(() => decodeContent(bytes('nonsense'))).toThrow(CryptoError)
  })

  it('Mode A: seals with a timelock and opens after the round', async () => {
    const unlockMs = timeOfRound(FIXTURE_ROUNDS[0] ?? 0)
    const sealed = await sealTimelocked({ content, unlockMs, nowMs: 1, client: fixtureClient() })
    expect(sealed.round).toBe(FIXTURE_ROUNDS[0])
    expect(sealed.bundleId).toHaveLength(16)

    const decoded = decodeBundle(sealed.bundle)
    expect(decoded?.mode).toBe('timelock')
    expect(
      await openTimelocked(sealed.bundle, { client: fixtureClient(), nowMs: unlockMs + 5000 }),
    ).toEqual(content)
    await failsWith(
      openTimelocked(sealed.bundle, { client: fixtureClient(), nowMs: unlockMs - 5000 }),
      'not-yet',
    )
  })

  it('Mode A: the ciphertext does not contain the letter, and a Mode B bundle is not opened as Mode A', async () => {
    const sealed = await sealTimelocked({
      content,
      unlockMs: timeOfRound(FIXTURE_ROUNDS[0] ?? 0),
      nowMs: 1,
      client: fixtureClient(),
    })
    expect(text(sealed.bundle)).not.toContain('dearest')
    const guarded = await sealForGuardians({
      content,
      heirAddress: ADDRESS,
      total: 3,
      threshold: 2,
      periodMs: 1000,
      graceMs: 1000,
      nowMs: 1,
    })
    await failsWith(openTimelocked(guarded.bundle), 'bad-bundle')
    await failsWith(openWithShares(sealed.bundle, guarded.shares), 'bad-bundle')
  })

  it('Mode B: the heir opens it with enough shares', async () => {
    const sealed = await sealForGuardians({
      content,
      heirAddress: ADDRESS,
      total: 3,
      threshold: 2,
      periodMs: 2 * 60_000,
      graceMs: 60_000,
      nowMs: 5,
    })
    expect(sealed.shares).toHaveLength(3)
    expect(sealed.policy).toMatchObject({
      threshold: 2,
      total: 3,
      heirAddress: ADDRESS,
      periodMs: 120_000,
      graceMs: 60_000,
    })
    expect(text(sealed.bundle)).not.toContain('dearest')

    for (const pair of [
      [0, 1],
      [1, 2],
      [0, 2],
    ]) {
      expect(
        await openWithShares(
          sealed.bundle,
          pair.map((i) => sealed.shares[i]!),
        ),
      ).toEqual(content)
    }
    expect(await openWithShares(sealed.bundle, sealed.shares)).toEqual(content)
  })

  it('Mode B: one share is not enough, and shares from another bundle fail', async () => {
    const a = await sealForGuardians({
      content,
      heirAddress: ADDRESS,
      total: 3,
      threshold: 2,
      periodMs: 1,
      graceMs: 1,
      nowMs: 1,
    })
    const b = await sealForGuardians({
      content,
      heirAddress: ADDRESS,
      total: 3,
      threshold: 2,
      periodMs: 1,
      graceMs: 1,
      nowMs: 1,
    })
    await failsWith(openWithShares(a.bundle, [a.shares[0]!]), 'insufficient-shares')
    await failsWith(openWithShares(a.bundle, [a.shares[0]!, b.shares[1]!]), 'wrong-key')
    await failsWith(openWithShares(a.bundle, [b.shares[0]!, b.shares[1]!]), 'wrong-key')
  })

  it('Mode B: guardians alone cannot read it, and the policy has no secrets', async () => {
    const sealed = await sealForGuardians({
      content,
      heirAddress: ADDRESS,
      total: 3,
      threshold: 2,
      periodMs: 1,
      graceMs: 1,
      nowMs: 1,
    })
    const policyBytes = encodePolicy(sealed.policy)
    const key = await combineShares(sealed.shares.slice(0, 2))
    expect(Array.from(policyBytes).join()).not.toContain(Array.from(key).join())
    expect(decodePolicy(policyBytes)).toEqual(sealed.policy)
    // The owner's check-in key verifies check-ins signed with the private half the owner kept.
    const checkIn = signCheckIn(sealed.ownerKey.privateKey, {
      bundleId: sealed.bundleId,
      counter: 1,
      timestampMs: 10,
    })
    expect(verifyCheckIn(sealed.policy.checkInPublicKey, checkIn)?.counter).toBe(1)
  })

  it('detects tampering with the header, the ciphertext or the policy', async () => {
    const sealed = await sealForGuardians({
      content,
      heirAddress: ADDRESS,
      total: 3,
      threshold: 2,
      periodMs: 1,
      graceMs: 1,
      nowMs: 1,
    })
    const shares = sealed.shares.slice(0, 2)
    const decoded = decodeBundle(sealed.bundle)
    if (decoded?.mode !== 'guardians') throw new Error('expected a guardian bundle')

    // Moving the ciphertext under a different bundle ID changes the authenticated header.
    const otherId = encodeBundle({
      ...decoded,
      bundleId: new Uint8Array(16).fill(1),
      policy: { ...decoded.policy, bundleId: new Uint8Array(16).fill(1) },
    })
    await failsWith(openWithShares(otherId, shares), 'decrypt-failed')
    // Flipping a ciphertext byte.
    const flipped = encodeBundle({
      ...decoded,
      ciphertext: decoded.ciphertext.map((b, i) => (i === 20 ? b ^ 1 : b)),
    })
    await failsWith(openWithShares(flipped, shares), 'decrypt-failed')
    // Swapping in a different key commitment.
    const swapped = encodeBundle({
      ...decoded,
      policy: { ...decoded.policy, keyCommitment: new Uint8Array(32) },
    })
    await failsWith(openWithShares(swapped, shares), 'wrong-key')
  })

  it('refuses a heir address that is not address-shaped', () => {
    const policy = {
      bundleId: new Uint8Array(16),
      threshold: 2,
      total: 3,
      keyCommitment: new Uint8Array(32),
      checkInPublicKey: new Uint8Array(32),
      periodMs: 1,
      graceMs: 1,
      heirAddress: 'bad address!',
    }
    expect(() => encodePolicy(policy)).toThrow(CryptoError)
  })

  it('refuses a bundle too large to send', async () => {
    await expect(
      sealForGuardians({
        content: { letter: 'x'.repeat(2048), giftSeed: 'y'.repeat(400) },
        heirAddress: 'a'.repeat(500),
        total: 3,
        threshold: 2,
        periodMs: 1,
        graceMs: 1,
        nowMs: 1,
      }),
    ).resolves.toBeDefined()
    expect(() =>
      encodeBundle({
        mode: 'timelock',
        bundleId: new Uint8Array(16),
        createdAtMs: 1,
        ciphertext: new Uint8Array(100),
        round: 1,
        lockedKey: new Uint8Array(8000),
      }),
    ).toThrow(CryptoError)
  })

  it('never throws on random or corrupted input (seeded fuzz)', async () => {
    const random = mulberry32(2026)
    const a = await sealTimelocked({
      content,
      unlockMs: timeOfRound(FIXTURE_ROUNDS[0] ?? 0),
      nowMs: 1,
      client: fixtureClient(),
    })
    const b = await sealForGuardians({
      content,
      heirAddress: ADDRESS,
      total: 3,
      threshold: 2,
      periodMs: 1,
      graceMs: 1,
      nowMs: 1,
    })
    for (let i = 0; i < 3000; i++) {
      const junk = Uint8Array.from({ length: Math.floor(random() * 300) }, () =>
        Math.floor(random() * 256),
      )
      expect(() => decodeBundle(junk)).not.toThrow()
      expect(() => decodePolicy(junk)).not.toThrow()
      for (const valid of [a.bundle, b.bundle]) {
        const damaged = valid.slice(
          0,
          random() < 0.2 ? Math.floor(random() * valid.length) : valid.length,
        )
        for (let flips = Math.floor(random() * 4); flips > 0 && damaged.length > 0; flips--) {
          damaged[Math.floor(random() * damaged.length)] = Math.floor(random() * 256)
        }
        expect(() => decodeBundle(damaged)).not.toThrow()
      }
      expect(() => verifyCheckIn(new Uint8Array(32), junk)).not.toThrow()
    }
  })
})
