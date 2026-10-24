import type { WasmModule } from './wasmApi.ts'

const WALLET_URL = '/wallet/webzjs_wallet.js'

let loading: Promise<WasmModule> | undefined

/**
 * Loads the WebAssembly wallet once, and starts its worker threads. The package is large (it holds
 * the proving parameters), so it is only fetched when a wallet is actually opened.
 */
export function loadWasm(): Promise<WasmModule> {
  loading ??= (async () => {
    // Served as-is from /wallet (copied there by `npm run wallet:build`), not bundled: the library starts
    // its own worker threads from its own files, which a bundler cannot follow.
    const module = (await import(/* @vite-ignore */ WALLET_URL)) as unknown as WasmModule
    await module.default()
    await module.initThreadPool(Math.max(2, Math.min(navigator.hardwareConcurrency, 8)))
    return module
  })()
  // A failed load can be tried again later (for example after the network came back).
  loading.catch(() => {
    loading = undefined
  })
  return loading
}
