/**
 * Every network destination Zealed is allowed to contact.
 *
 * The Content Security Policy's `connect-src` is generated from this file (see
 * `securityHeaders.ts`), so the browser blocks any request to a host not listed here.
 * This module is also imported by `vite.config.ts`, so it must stay free of browser APIs.
 */

/** Zealed runs on Zcash testnet only. */
export const ZCASH_NETWORK = 'testnet'

export interface LightwalletEndpoint {
  /** Human-readable name shown in settings. */
  label: string
  /** gRPC-web base URL of a lightwalletd-compatible server. */
  url: string
}

/** gRPC-web light-wallet endpoints, in order of preference. The first entry is the primary. */
export const LIGHTWALLET_ENDPOINTS: readonly LightwalletEndpoint[] = [
  { label: 'Zec.rocks (testnet)', url: 'https://zjs.zec.rocks/testnet' },
  // Fallbacks are appended here (own gRPC-web proxy in Phase 15).
]

/**
 * drand quicknet: the unchained BLS (RFC 9380) beacon used for timelock encryption.
 * These match the defaults of tlock-js 0.9.0 `mainnetClient()`.
 */
export const DRAND = {
  baseUrl: 'https://api.drand.sh',
  chainHash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
} as const

/** Origins the app may connect to, derived from the endpoints above. */
export function allowedConnectOrigins(): string[] {
  const urls = [...LIGHTWALLET_ENDPOINTS.map((endpoint) => endpoint.url), DRAND.baseUrl]
  return [...new Set(urls.map((url) => new URL(url).origin))]
}
