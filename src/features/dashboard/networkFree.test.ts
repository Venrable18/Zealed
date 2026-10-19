import { describe, expect, it } from 'vitest'

/**
 * The dashboard must make no network requests. This reads its source files and fails if any uses a
 * network API or imports a module that talks to the network. The browser test
 * (tests/e2e/dashboard.spec.ts) checks the same thing on the running page.
 */
const dashboardFiles = import.meta.glob<string>(
  ['./*.ts', './*.tsx', '../../app/routes/Dashboard.tsx', '!./*.test.*', '!./scenario.ts'],
  { query: '?raw', import: 'default', eager: true },
)

const FORBIDDEN_CALLS = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /\bWebSocket\b/,
  /EventSource/,
  /sendBeacon/,
  /navigator\.serviceWorker/,
  /importScripts/,
  /new Image\(/,
  /\.src\s*=/,
]
const FORBIDDEN_IMPORTS = [/lightwalletd/, /tlock/, /drand/, /\/network\.ts/, /webzjs/i, /grpc/i]

describe('the dashboard makes no network requests', () => {
  it('reads real source files', () => {
    expect(Object.keys(dashboardFiles).length).toBeGreaterThanOrEqual(5)
    expect(Object.keys(dashboardFiles).some((name) => name.endsWith('Dashboard.tsx'))).toBe(true)
  })

  it.each(Object.entries(dashboardFiles))(
    '%s uses no network API and imports nothing that does',
    (name, source) => {
      for (const pattern of FORBIDDEN_CALLS)
        expect(source, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      const imports = source
        .split('\n')
        .filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line))
      for (const line of imports)
        for (const pattern of FORBIDDEN_IMPORTS)
          expect(line, `${name}: ${line}`).not.toMatch(pattern)
    },
  )
})
