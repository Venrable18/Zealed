# Zealed wallet (WebAssembly)

The Zcash wallet Zealed runs in the browser. It is built from [WebZjs] (the browser wallet library
now maintained by red.dev / Zcash Community Grants), changed so it works on today's testnet.

**Verified on the live NU7 testnet (2026-10-24)**, natively and in Chromium: sync; receiving an
Ironwood payment from another wallet; sending one transaction with two memos to itself and reading
both memos back; sending zero-value outputs that carry only memos. See "Evidence" below.

## What was changed, and why

| Problem                                                                                                  | Fix                                                                                                                                                     | Where                                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| WebZjs signs for NU6.3; testnet has been on **NU7** since 2026-10-04                                     | NU7's branch id (`0x77190AD9`) and testnet height (4,465,026) in `zcash_protocol`                                                                       | `patches/zcash_protocol-nu7.patch`             |
| The wallet database **could not store Ironwood notes**, the only pool that accepts new value since NU6.3 | Use `zcash_client_memory` from [zcash/zcash_client_memory#17] (adds Ironwood), plus a few functions it leaves unfinished and a public way to list notes | `patches/zcash_client_memory-notes.patch`      |
| No way to send a **memo** or several outputs at once                                                     | `send_payments`: one transaction, several recipients, each with an optional 512-byte memo; change to Ironwood                                           | `crates/webzjs-wallet/src/wallet.rs`           |
| Memos never reached JavaScript                                                                           | `received_notes`: every received note, with its arbitrary-data memo read from the full transaction, and the block time                                  | `crates/webzjs-wallet/src/{wallet.rs,bindgen}` |
| `wasm_thread` used `eval`, which Zealed's content security policy forbids                                | Patched not to                                                                                                                                          | `patches/wasm_thread-no-eval.patch`            |
| The testnet gRPC-web server cannot stream transparent UTXOs; that stopped every sync                     | A failed UTXO refresh no longer stops a sync (Zealed holds shielded money only)                                                                         | `patches/zcash_client_backend-utxo.patch`      |
| `tonic` 0.14.6 rejects that server's responses ("missing grpc-status trailer")                           | Locked at 0.14.3 in `Cargo.lock`                                                                                                                        | `Cargo.lock`                                   |

The library stack is the released NU6.3 one (`zcash_client_backend` 0.24.0 and friends) with the
patches above. NU7 keeps NU6.3's v6 transaction format, so the NU7 patch is small. Moving to the
NU7 releases (`zcash_client_backend` 0.25, 2026-10-21) is the right long-term step and is not done.

`crates/` is vendored from WebZjs (MIT / Apache-2.0, see the licence files here) with the changes
made in place. `transaction_history` was removed (Zealed does not use it; it read private tables).

## Build

Needs `rustup` (the nightly in `rust-toolchain.toml` is installed on demand), `wasm-pack`, `curl`,
`patch`, `shasum`, and a clang that can target WebAssembly (on macOS: `brew install llvm`).

```sh
npm run wallet:build      # from the repo root; about 10 minutes the first time
```

`scripts/setup.sh` fetches the patched dependencies into `wallet/.deps` (crates.io downloads are
checked against their published SHA-256), applies the patches, then `wasm-pack` builds `wallet/pkg`,
which is copied to `public/wallet` where the app loads it. The package is about 60 MB (55 MB
compressed) because it holds the proving parameters.

## Evidence (testnet, 2026-10-24)

| What                                                   | Transaction                                                        | Height    |
| ------------------------------------------------------ | ------------------------------------------------------------------ | --------- |
| Received 0.05 TAZ (Ironwood) from another wallet       | `98659b05a6e276f6a97f07b84a459d7e1082dc656988a35626134266b712ba4f` | 4,536,826 |
| Sent two 0.0001 TAZ outputs with memos, read both back | `7cee099c0dfffc9137a331562a217231e7d971e5a6c3e0acba04198350392026` | 4,536,932 |
| Sent two zero-value outputs with memos, read both back | `9e81283d11c54a2ef773c5ba5034c269dc5b115e95e038888fac30899f7e489b` | 4,536,966 |

The same send and read-back also passes through the app in Chromium
(`tests/e2e/wallet.send.live.spec.ts`).

## Checks

- Native: `RUSTFLAGS='--cfg zcash_unstable="nu7"' cargo check -p webzjs-wallet --no-default-features --features native`.
- `examples/probe.rs` syncs a testnet wallet natively. With `SEND=1` it sends two memos to itself;
  with `ZERO=1`, two zero-value memo outputs; with `SHIELD=1`, it shields transparent coins.
- Browser: `LIVE_TESTNET=1 npx playwright test tests/e2e/wallet.live.spec.ts` (new wallet, sync);
  `LIVE_TESTNET_SEED_FILE=… LIVE_TESTNET_BIRTHDAY=… npx playwright test --project=dev tests/e2e/wallet.send.live.spec.ts`
  (funded wallet: send and read back; spends a small fee).

[WebZjs]: https://github.com/ZcashCommunityGrants/WebZjs
[zcash/zcash_client_memory#17]: https://github.com/zcash/zcash_client_memory/pull/17
