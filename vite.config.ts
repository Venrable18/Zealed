import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
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

const WALLET_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.ts': 'text/plain',
}

/**
 * Dev server only: serves the built wallet (public/wallet) exactly as the production host does.
 * Vite would otherwise refuse, because the app imports it at run time from `public/`, which Vite's
 * dev server does not allow for scripts.
 */
function serveWalletInDev(): Plugin {
  return {
    name: 'zealed:serve-wallet-in-dev',
    apply: 'serve',
    configureServer(server) {
      const root = join(server.config.root, 'public', 'wallet')
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? ''
        if (!path.startsWith('/wallet/')) {
          next()
          return
        }
        const file = normalize(join(root, path.slice('/wallet/'.length)))
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
          next()
          return
        }
        res.setHeader('Content-Type', WALLET_TYPES[extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
        createReadStream(file).pipe(res)
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
    plugins: [react(), tailwindcss(), headersFile(), serveWalletInDev()],
    ...(devNonce === undefined ? {} : { html: { cspNonce: devNonce } }),
    server: {
      headers: buildSecurityHeaders(devNonce === undefined ? {} : { devNonce }),
    },
    preview: {
      headers: buildSecurityHeaders(),
    },
    build: {
      // The CSP allows fonts from the app's own origin only (`font-src 'self'`), so a font must
      // never be inlined as a data: URL, however small.
      assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? false : undefined),
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      // The seeded fuzz tests are heavier than a normal unit test and run alongside others.
      testTimeout: 20_000,
    },
  }
})
