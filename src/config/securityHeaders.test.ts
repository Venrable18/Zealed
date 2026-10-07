import { describe, expect, it } from 'vitest'
import { DRAND, LIGHTWALLET_ENDPOINTS, allowedConnectOrigins } from './network.ts'
import { buildCsp, buildSecurityHeaders, toHeadersFile } from './securityHeaders.ts'

function directive(csp: string, name: string): string[] {
  const entry = csp
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([directiveName]) => directiveName === name)
  if (entry === undefined) throw new Error(`missing ${name}`)
  return entry.slice(1)
}

describe('allowedConnectOrigins', () => {
  it('contains exactly the light-wallet and drand origins', () => {
    const expected = new Set(
      [...LIGHTWALLET_ENDPOINTS.map((e) => e.url), DRAND.baseUrl].map((url) => new URL(url).origin),
    )
    expect(new Set(allowedConnectOrigins())).toEqual(expected)
  })

  it('only allows https', () => {
    for (const origin of allowedConnectOrigins()) expect(origin).toMatch(/^https:\/\//)
  })
})

describe('buildCsp (production)', () => {
  const csp = buildCsp()

  it('limits connect-src to self and network.ts origins', () => {
    expect(directive(csp, 'connect-src')).toEqual(["'self'", ...allowedConnectOrigins()])
  })

  it('allows no remote or inline scripts, styles or fonts', () => {
    expect(directive(csp, 'default-src')).toEqual(["'none'"])
    expect(directive(csp, 'script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"])
    expect(directive(csp, 'style-src')).toEqual(["'self'"])
    expect(directive(csp, 'font-src')).toEqual(["'self'"])
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).not.toContain('nonce-')
    expect(csp).not.toContain('ws:')
  })

  it('blocks framing, plugins and base/form hijacking', () => {
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"])
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
    expect(directive(csp, 'base-uri')).toEqual(["'none'"])
    expect(directive(csp, 'form-action')).toEqual(["'none'"])
  })
})

describe('buildCsp (dev server)', () => {
  it('adds the nonce and HMR socket only', () => {
    const csp = buildCsp({ devNonce: 'abc' })
    expect(directive(csp, 'script-src')).toContain("'nonce-abc'")
    expect(directive(csp, 'style-src')).toContain("'nonce-abc'")
    expect(directive(csp, 'connect-src')).toContain('ws://localhost:*')
    expect(csp).not.toContain('unsafe-inline')
  })
})

describe('buildSecurityHeaders', () => {
  it('enables cross-origin isolation and disables referrers', () => {
    const headers = buildSecurityHeaders()
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(headers['Cross-Origin-Embedder-Policy']).toBe('require-corp')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
  })

  it('renders a _headers file for every path', () => {
    const file = toHeadersFile({ 'X-Test': 'yes' })
    expect(file).toBe('/*\n  X-Test: yes\n')
  })
})
