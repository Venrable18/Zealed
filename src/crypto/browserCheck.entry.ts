// Test-only. Bundled for the browser by tests/e2e/crypto-browser.spec.ts; never imported by the app. Runs the crypto flows and returns a summary.
import { decrypt, encrypt, generateKey } from './aes.ts'
import { openTimelocked, openWithShares, sealForGuardians, sealTimelocked } from './bundle.ts'
import { combineShares, splitSecret } from './shamir.ts'
import { generateKeypair, signCheckIn, verifyCheckIn } from './sign.ts'
import { FIXTURE_ROUNDS, fixtureClient } from './testClient.ts'
import { timeOfRound } from './tlock.ts'

async function run() {
  const key = generateKey()
  const aes = new TextDecoder().decode(
    await decrypt(key, await encrypt(key, new TextEncoder().encode('hello'))),
  )

  const secret = generateKey()
  const shares = await splitSecret(secret, 3, 2)
  const shamir =
    (await combineShares([shares[0] ?? new Uint8Array(), shares[2] ?? new Uint8Array()])).join() ===
    secret.join()

  const owner = generateKeypair()
  const bundleId = new Uint8Array(16).fill(3)
  const sig = verifyCheckIn(
    owner.publicKey,
    signCheckIn(owner.privateKey, { bundleId, counter: 2, timestampMs: 5 }),
  )?.counter

  const content = { letter: 'a letter', giftSeed: 'seed words' }
  const unlockMs = timeOfRound(FIXTURE_ROUNDS[0] ?? 0)
  const timelocked = await sealTimelocked({ content, unlockMs, nowMs: 1, client: fixtureClient() })
  const tlock = (
    await openTimelocked(timelocked.bundle, { client: fixtureClient(), nowMs: unlockMs + 5000 })
  ).letter

  const guarded = await sealForGuardians({
    content,
    heirAddress: 'utest1fakeaddressfakeaddressfakeaddress',
    total: 3,
    threshold: 2,
    periodMs: 1,
    graceMs: 1,
    nowMs: 1,
  })
  const guardians = (await openWithShares(guarded.bundle, guarded.shares.slice(1))).letter

  return { aes, shamir, sig, tlock, guardians }
}

Object.assign(globalThis, { runCrypto: run })
