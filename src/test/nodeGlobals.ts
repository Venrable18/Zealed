import { webcrypto } from 'node:crypto'

/**
 * Test-only. Import first in a jsdom test that needs real encryption. jsdom differs from a real
 * browser in two ways that matter to the crypto code:
 *
 * - it has `crypto.getRandomValues` but no `crypto.subtle`;
 * - it has its own `Uint8Array`, different from the one Node's `Buffer` is built on, so libraries
 *   that check `instanceof Uint8Array` (tlock-js's hashing) reject bytes made by the other one.
 *
 * Both are jsdom artifacts: a browser has a single `Uint8Array` and a full `crypto.subtle`, and
 * the Chromium test in tests/e2e/crypto-browser.spec.ts runs the same flows there.
 */
if (typeof globalThis.crypto.subtle === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

const NodeUint8Array = (
  Object.getPrototypeOf(Buffer.prototype) as { constructor: Uint8ArrayConstructor }
).constructor
if (globalThis.Uint8Array !== NodeUint8Array) {
  Object.defineProperty(globalThis, 'Uint8Array', {
    value: NodeUint8Array,
    configurable: true,
    writable: true,
  })
}
