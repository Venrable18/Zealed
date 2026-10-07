# Capabilities

What Zealed depends on, whether it was verified, and any difference from the build plan.
Status: **verified** (checked against the package or live service), **pending** (not checked
yet), **unsupported** (checked and missing; see workaround).

## Toolchain (verified 2026-10-07, Phase 1)

| Item           | Version used                                             | Notes                                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js        | 24 (`.nvmrc`)                                            | Vite 8 needs Node ≥ 22.12.                                                                                                                                                                                                         |
| Vite           | 8.3.3                                                    | Vite 8 bundles with Rolldown. `create-vite` now scaffolds oxlint; the plan asks for ESLint, so ESLint is used instead.                                                                                                             |
| TypeScript     | 6.0.3                                                    | **Differs from latest.** TypeScript 7.0 (native port) is `latest` on npm, but typescript-eslint 8.71 supports `<6.1.0` only. Pinned to `~6.0.3`, which is also what `create-vite` uses. Revisit when typescript-eslint supports 7. |
| React          | 19.3.0                                                   |                                                                                                                                                                                                                                    |
| React Router   | 8.4.0                                                    | Same data-router API as v7: `createBrowserRouter` from `react-router`, `RouterProvider` from `react-router/dom`.                                                                                                                   |
| Zustand        | 5.0.15                                                   |                                                                                                                                                                                                                                    |
| Tailwind CSS   | 4.3.3 (`@tailwindcss/vite`)                              | **Differs from plan wording.** Tailwind 4 has no `tailwind.config.js`; design tokens (Phase 5) go in an `@theme` block in `src/index.css`.                                                                                         |
| ESLint         | 10.12.0 + typescript-eslint 8.71.1 (`strictTypeChecked`) | `no-console: error` in app code.                                                                                                                                                                                                   |
| Vitest         | 5.0.3                                                    |                                                                                                                                                                                                                                    |
| Playwright     | 1.63.0                                                   | Chromium only so far.                                                                                                                                                                                                              |
| GitHub Actions | `checkout@v7`, `setup-node@v7`, `upload-artifact@v7`     |                                                                                                                                                                                                                                    |

## Network endpoints

| Endpoint                                                | Status                          | Notes                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://zjs.zec.rocks/testnet` (primary gRPC-web)      | reachable, gRPC-web **pending** | A plain GET returns HTTP 415 `application/grpc`, so a gRPC server answers. Real gRPC-web calls are verified in Phase 2.                                                            |
| `https://zcash-testnet.chainsafe.dev` (ChainSafe proxy) | **not used**                    | Now 301-redirects to `https://testnet.zec.rocks/`, a native gRPC lightwalletd (not gRPC-web). Not added to the fallback list.                                                      |
| drand quicknet, `https://api.drand.sh`                  | verified                        | `/<chain>/info` returns 200. tlock-js 0.9.0 `mainnetClient()` uses exactly this: chain hash `52db9ba7…e971`, scheme `bls-unchained-g1-rfc9380`, period 3 s. drand-client is 1.4.2. |

## Packages for later phases

| Package (plan name)                                                                                           | Status                       | Notes                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@chainsafe/webzjs-wallet`                                                                                    | **unsupported (not on npm)** | `npm view` returns 404. npm search shows `@chainsafe/webzjs-keys`, `@chainsafe/webzjs-zcash-snap` and `@zcashcommunitygrants/webzjs-*` (latest publish 2026-09-11), plus unofficial forks (`@bytezhang/webzjs-wallet`, `zprotocol-webzjs-wallet`, `webz.js`) that must not be used without vetting. Phase 2 must pick an official source (published package or build from the WebZjs repo). |
| `tlock-js`                                                                                                    | verified (0.9.0)             | Defaults match the plan (see drand above). Not installed until Phase 8.                                                                                                                                                                                                                                                                                                                     |
| `drand-client`                                                                                                | verified (1.4.2)             | Pulled in by tlock-js.                                                                                                                                                                                                                                                                                                                                                                      |
| `shamir-secret-sharing`, `@noble/curves`, `@noble/hashes`, `qrcode`, `jsqr`/`html5-qrcode`, `vite-plugin-pwa` | pending                      | Checked in the phase that first uses them.                                                                                                                                                                                                                                                                                                                                                  |

## Zcash operations (Phase 2 gate)

| Capability                                                          | Status             | Workaround               |
| ------------------------------------------------------------------- | ------------------ | ------------------------ |
| Initialize WASM and thread pool once                                | pending            |                          |
| Connect to endpoint, fetch chain info, endpoint fallback            | pending            |                          |
| Create wallet, restore from seed, sync in a Web Worker              | pending            |                          |
| Unified address, faucet funding, balance                            | pending            |                          |
| Shielded send **with memo**, receive and decrypt memo               | pending (**gate**) |                          |
| One transaction with **multiple outputs/memos** to one recipient    | pending (**gate**) | One memo per transaction |
| Current shielded pool and transaction version                       | pending            |                          |
| Multiple accounts in one wallet                                     | pending            | Separate wallet per pot  |
| Fresh addresses, viewing key export/import, block heights and times | pending            |                          |

## Platform requirements

| Requirement                                                       | Status               | Notes                                                                                                           |
| ----------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cross-origin isolation (COOP `same-origin` + COEP `require-corp`) | verified in Chromium | `window.crossOriginIsolated === true` on the dev server and `vite preview` (Playwright).                        |
| WebAssembly under CSP                                             | configured           | `script-src` includes `'wasm-unsafe-eval'` (allows WASM compilation only, not JS `eval`). Exercised in Phase 2. |
| Workers under CSP                                                 | configured           | `worker-src 'self'`. If WebZjs spawns `blob:` workers, this must be widened in Phase 2 and recorded here.       |
