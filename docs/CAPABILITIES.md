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

| Endpoint                                                | Status                | Notes                                                                                                                                                                                                               |
| ------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://zjs.zec.rocks/testnet` (primary gRPC-web)      | verified (2026-10-07) | A gRPC-web `GetLightdInfo` POST returns status 0: lightwalletd v0.5.4, Zebra 7.0.0-rc.0, chain `test`, height 4,475,856, consensus branch `77190ad9` (NU7). Browser CORS/COEP behavior is checked once WebZjs runs. |
| `https://zcash-testnet.chainsafe.dev` (ChainSafe proxy) | **not used**          | Now 301-redirects to `https://testnet.zec.rocks/`, a native gRPC lightwalletd (not gRPC-web). Not added to the fallback list.                                                                                       |
| drand quicknet, `https://api.drand.sh`                  | verified              | `/<chain>/info` returns 200. tlock-js 0.9.0 `mainnetClient()` uses exactly this: chain hash `52db9ba7…e971`, scheme `bls-unchained-g1-rfc9380`, period 3 s. drand-client is 1.4.2.                                  |

## Packages for later phases

| Package (plan name)                                                                 | Status                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@chainsafe/webzjs-wallet`                                                          | **not on npm; ChainSafe repo obsolete** | Only `webzjs-keys` is published (`@chainsafe/` 0.1.0, `@zcashcommunitygrants/` 0.1.0). WebZjs is now maintained at https://github.com/ZcashCommunityGrants/WebZjs (red.dev handover, `main` bdbc6f2, 2026-09-11, NU6.3). Build with `just build-wallet` (Rust `nightly-2025-06-15`, wasm-pack). ChainSafe `main` is pre-Ironwood. Unofficial npm forks (`@bytezhang/*`, `zprotocol-webzjs-wallet`, `webz.js`) are not used. See "Gate result". |
| `tlock-js`                                                                          | verified (0.9.0)                        | Defaults match the plan (see drand above). Not installed until Phase 8.                                                                                                                                                                                                                                                                                                                                                                        |
| `drand-client`                                                                      | verified (1.4.2)                        | Pulled in by tlock-js.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `qrcode` 1.5.4 (MIT), `@types/qrcode`                                               | **verified (2026-10-14, Phase 5)**      | Used only for `QRCode.create()`, which returns the module grid; Zealed draws the SVG itself, so no `innerHTML` and no canvas.                                                                                                                                                                                                                                                                                                                  |
| `jsqr` 1.4.0 (Apache-2.0)                                                           | **verified (2026-10-14, Phase 5)**      | Decodes camera frames on-device. Chosen over `html5-qrcode` (fewer dependencies, no UI of its own).                                                                                                                                                                                                                                                                                                                                            |
| `@fontsource-variable/inter` 5.3.0, `@fontsource-variable/fraunces` 5.3.0 (OFL-1.1) | **verified (2026-10-14, Phase 5)**      | Self-hosted: Vite bundles the woff2 files into `dist/assets`, so the CSP `font-src 'self'` holds and nothing loads from a CDN.                                                                                                                                                                                                                                                                                                                 |
| `shamir-secret-sharing`, `@noble/curves`, `@noble/hashes`, `vite-plugin-pwa`        | pending                                 | Checked in the phase that first uses them.                                                                                                                                                                                                                                                                                                                                                                                                     |

## Zcash operations (Phase 2 gate)

| Capability                                                          | Status                                                                    | Workaround              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------- |
| Initialize WASM and thread pool once                                | pending                                                                   |                         |
| Connect to endpoint, fetch chain info, endpoint fallback            | chain info verified outside the browser (curl, gRPC-web); browser pending |                         |
| Create wallet, restore from seed, sync in a Web Worker              | pending                                                                   |                         |
| Unified address, faucet funding, balance                            | pending                                                                   |                         |
| Shielded send **with memo**, receive and decrypt memo               | **FAILS (gate)**                                                          | See "Gate result" below |
| One transaction with **multiple outputs/memos** to one recipient    | **FAILS (gate)**                                                          | See "Gate result" below |
| Current shielded pool and transaction version                       | **FAILS (gate)**: testnet is NU7 + Ironwood; no WebZjs supports NU7       | See "Gate result" below |
| Multiple accounts in one wallet                                     | pending                                                                   | Separate wallet per pot |
| Fresh addresses, viewing key export/import, block heights and times | pending                                                                   |                         |
| ZIP 302 arbitrary-data memo marker (`0xFF`) for ZMP                 | verified against zips.z.cash (2026-10-14)                                 |                         |

## Platform requirements

| Requirement                                                       | Status               | Notes                                                                                                           |
| ----------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cross-origin isolation (COOP `same-origin` + COEP `require-corp`) | verified in Chromium | `window.crossOriginIsolated === true` on the dev server and `vite preview` (Playwright).                        |
| WebAssembly under CSP                                             | configured           | `script-src` includes `'wasm-unsafe-eval'` (allows WASM compilation only, not JS `eval`). Exercised in Phase 2. |
| Workers under CSP                                                 | configured           | `worker-src 'self'`. If WebZjs spawns `blob:` workers, this must be widened in Phase 2 and recorded here.       |

## Gate result (Phase 2): FAILED, stopped (re-checked 2026-10-07)

Two independent blockers. Both were found by reading the source and querying the live testnet
endpoint, not with a running build. The limits are in the API and the consensus rules, so a
build would not change the conclusion.

### Blocker 1: no WebZjs build can transact on current testnet

- **Testnet is on NU7.** The primary endpoint reports consensus branch ID `77190ad9`
  (`BranchId::Nu7` in librustzcash) at height 4,475,856. NU7 activated on testnet at block
  4,465,026 on 2026-10-04. NU7 also cuts the target block time from 75 s to 25 s (ZIP 218)
  and disables v4 transactions. Mainnet NU7 is targeted for 2026-11-05.
- **Orchard no longer accepts new value.** Since NU6.3 ("Ironwood": testnet 4,134,000,
  mainnet 3,428,143, 2026-07-28), new value goes into the Ironwood pool; Orchard funds can only
  migrate out. **Ironwood is the "current shielded pool" the plan refers to.**
- **ChainSafe/WebZjs** `main` (a50df94, 2026-04-16) is on an NU6.1 librustzcash fork. It
  predates both NU6.3 and NU7 and always sends change to Orchard. It cannot be used.
- **ZcashCommunityGrants/WebZjs** `main` (bdbc6f2, 2026-09-11) is the maintained successor
  (red.dev handover). It is on librustzcash rev `0a2c6d1a` with NU6.3/Ironwood support, but
  that rev has no NU7 testnet height. The NU7 branch ID landed upstream on 2026-09-22 and the
  testnet height on 2026-10-01. A wallet on that rev would sign testnet transactions with the
  NU6.3 branch ID, which nodes reject. No NU7 branch exists in the ZCG or red-dev-inc repos.
- ZCG's `propose_transfer` still passes `ShieldedProtocol::Orchard` as the change pool
  (`crates/webzjs-wallet/src/wallet.rs:318`). It may be rejected now that Orchard is closed;
  unverified.

### Blocker 2: no memo or multi-output API (both repos)

Line numbers are for ZCG `main`; ChainSafe is identical except where noted.

- **Send with a memo:** `propose_transfer(account_id, to_address, value)` and `pczt_create`
  take no memo and build `Payment::without_memo` (`wallet.rs:326`; ChainSafe `:322`).
- **Multiple outputs in one transaction:** the request is a single-payment
  `TransactionRequest`. The separate `webzjs-requests` crate can build ZIP-321 requests with
  several payments and memos, but no wallet function accepts one.
- **Receive and read ZMP memos:** transaction history only returns `Memo::Text`
  (`bindgen/transaction_history.rs:197`, `:256`). ZMP's arbitrary-data memos never reach JS.
- **Persistence (not a blocker):** the wallet DB is in memory (`MemoryWalletDb`) and is
  persisted by serializing with `db_to_bytes()`. Phase 3 must encrypt and store those bytes.

The underlying librustzcash crates support memos and multiple payments, so this gap is in
the WebZjs binding layer.

### Proposed fallbacks (need a human decision)

1. **Fork ZCG/WebZjs and bring it up to NU7 ourselves (recommended if the hackathon cannot
   wait).**
   - Move the librustzcash family (and the `red-dev-inc/zcash_client_memory` fork, which
     must pin the same rev) to a commit at or after the 2026-10-01 NU7 testnet height.
   - Use Ironwood as the change pool.
   - Add a `propose_payments(account_id, payments)` binding (address, value, optional
     512-byte memo) and return received memos as raw bytes.

   This is real dependency work: about two weeks of librustzcash changes between the pinned
   rev and NU7, plus a second fork to maintain and a Rust/WASM build in CI.

2. **Wait for ZCG/red.dev to ship NU7, then add only the memo/multi-output binding.** Less
   work for us, but the date is unknown. Mainnet NU7 (2026-11-05) gives them a deadline.
3. **Not viable:** ChainSafe main (pre-Ironwood); dropping memos (every feature uses them);
   regtest instead of testnet (plan rule 5).

Once memos exist, the plan's fallback for multi-output (one memo per transaction) also
works. But Blind Pot wishes and chunked 2 KB messages then take several transactions, each
paying a ZIP-317 fee.

### Consequences for later phases (whichever option is chosen)

- NU7 block times differ from NU6.3 (25 s vs 75 s). Confirmation waits, countdowns and
  "spendable" estimates must read heights and times from the chain (plan rule 5).
- Contributors' and owners' funds must be in Ironwood. Orchard funds need the migration
  turnstile, which reveals the amount on-chain. The UI must never move funds through it
  silently.

### Not yet verified (blocked on a working build)

WASM and thread-pool init, sync in a worker, new/restore wallet, unified address and faucet
funding, balance, multiple accounts, fresh addresses, viewing-key export, block heights and
times. Toolchains available: Rust stable, `nightly-2025-06-15` (ZCG's pin), wasm-pack, just.

## Wallet interface Blind Pot needs (Phase 6)

Blind Pot talks to the wallet only through `PotWalletPort` (`src/features/blindpot/walletPort.ts`).
The wallet work (Phase 3, using the WebZjs tooling) must provide it. Status: **pending**.

| Method                         | Needs from WebZjs                                                               |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `createPotAccount(label)`      | A new account and its unified address (or a new wallet if multi-account fails). |
| `balanceAsOf(accountId, atMs)` | Sum of notes mined at or before a time. Needs block times, not just heights.    |
| `piecesAsOf(accountId, atMs)`  | Count of received notes at or before a time.                                    |
| `memosAsOf(accountId, atMs)`   | Raw 512-byte memos for received notes (tooling goal: raw memo access).          |
| `withdrawAll(accountId)`       | A send from the pot account to the main account.                                |

## Wallet interface the guest side needs (Phase 7)

Guests use `ContributorWalletPort` (`src/features/blindpot/contributorWallet.ts`). Status:
**pending**.

| Method                               | Needs from WebZjs                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `spendableZat()`                     | Spendable balance, excluding change that is not yet spendable.                         |
| `sendPiece({ address, zat, memo? })` | One shielded transaction to one address with an optional 512-byte arbitrary-data memo. |
| result `not-spendable-yet`           | A way to tell "change not yet spendable" from other failures.                          |
| result `insufficient-funds`          | A way to tell "not enough funds" from other failures.                                  |

Unfinished gifts also need encrypted storage (`ContributionStore`) to resume after a reload.
