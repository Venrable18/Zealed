/**
 * HTTP security headers shared by the dev server, `vite preview` and the deployed
 * `_headers` file. This module is imported by `vite.config.ts`, so it must stay free of
 * browser APIs.
 */
import { allowedConnectOrigins } from './network.ts'

export interface CspOptions {
  /**
   * Dev server only. Vite stamps this nonce on the scripts and styles it injects
   * (React Refresh preamble, HMR styles), and the HMR websocket is allowed.
   * Production builds have no inline code and never set this.
   */
  devNonce?: string
}

const DEV_HMR_SOURCES = ['ws://localhost:*', 'ws://127.0.0.1:*']

export function buildCsp({ devNonce }: CspOptions = {}): string {
  const nonce = devNonce === undefined ? [] : [`'nonce-${devNonce}'`]
  const directives: Record<string, string[]> = {
    'default-src': ["'none'"],
    // 'wasm-unsafe-eval' lets WebAssembly (WebZjs) compile; it does not allow JS eval.
    'script-src': ["'self'", "'wasm-unsafe-eval'", ...nonce],
    'style-src': ["'self'", ...nonce],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': [
      "'self'",
      ...allowedConnectOrigins(),
      ...(devNonce === undefined ? [] : DEV_HMR_SOURCES),
    ],
    // blob: lets the wallet start its proving threads (the library makes each from a blob that imports its own files).
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}

export function buildSecurityHeaders(options: CspOptions = {}): Record<string, string> {
  return {
    'Content-Security-Policy': buildCsp(options),
    // Cross-origin isolation, required for SharedArrayBuffer (multithreaded WASM).
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }
}

/** Renders headers in the `_headers` file format used by Cloudflare Pages and Netlify. */
export function toHeadersFile(headers: Record<string, string>): string {
  const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)
  return ['/*', ...lines, ''].join('\n')
}
