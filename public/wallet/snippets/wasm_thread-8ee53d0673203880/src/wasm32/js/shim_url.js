// Where the wasm-bindgen shim (the package's main .js file) is, found without `eval`.
// This file is copied to <package>/snippets/wasm_thread-<hash>/src/wasm32/js/.
export function shim_url() {
  return new URL('../../../../../webzjs_wallet.js', import.meta.url).href;
}
