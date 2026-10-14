import { randomBytes } from 'node:crypto'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { buildSecurityHeaders, toHeadersFile } from './src/config/securityHeaders.ts'

/** Emits `dist/_headers` so the static host serves the same headers as `vite preview`. */
function headersFile(): Plugin {
  return {
    name: 'zealed:headers-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: toHeadersFile(buildSecurityHeaders()),
      })
    },
  }
}

export default defineConfig(({ command, isPreview }) => {
  // The dev server injects inline scripts/styles (React Refresh, HMR). Vite stamps them with
  // this per-run nonce so the dev CSP never needs 'unsafe-inline'.
  const devNonce =
    command === 'serve' && isPreview !== true ? randomBytes(16).toString('base64') : undefined

  return {
    plugins: [react(), tailwindcss(), headersFile()],
    ...(devNonce === undefined ? {} : { html: { cspNonce: devNonce } }),
    server: {
      headers: buildSecurityHeaders(devNonce === undefined ? {} : { devNonce }),
    },
    preview: {
      headers: buildSecurityHeaders(),
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      // The seeded fuzz tests are heavier than a normal unit test and run alongside others.
      testTimeout: 20_000,
    },
  }
})
