# Zealed wallet (WebAssembly)

The Zcash wallet Zealed runs in the browser. It is built from [WebZjs] (the browser wallet library
now maintained by red.dev / Zcash Community Grants), which Zealed could not use as it was, for three
reasons found in the Phase 2 gate (see `docs/CAPABILITIES.md`). Here is what changed.

| Problem in WebZjs                                        | What was done                                                                                            | Where                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Built for NU6.3. Testnet has been on **NU7** since Oct 4 | A small patch to librustzcash: NU7's real branch id (`0x77190AD9`) and testnet height (4,465,026)        | `patches/librustzcash-nu7.patch`     |
| No way to send a **memo** or several outputs at once     | `send_payments`: one transaction, several recipients, each with an optional 512-byte memo                | `crates/webzjs-wallet/src/wallet.rs` |
| Memos never reached JavaScript; change went to Orchard   | `received_notes` (all notes, arbitrary-data memos as raw bytes, with block time); change to **Ironwood** | `crates/webzjs-wallet/src/bindgen`   |

Everything else (note scanning, proving, the in-memory wallet database) is unchanged WebZjs and
`zcash_client_memory`. The `crates/` folder is vendored from WebZjs (MIT / Apache-2.0, see the
licence files here) with those changes made in place.

## Why a patch, not a newer librustzcash

librustzcash published NU7-ready crates on 2026-10-21 (`zcash_client_backend` 0.25), but they changed
the storage traits that `zcash_client_memory` implements (output locking, a separate Ironwood pool,
anchor checks): about 200 compile errors to port. NU7 uses the same v6 transaction format as NU6.3, so
adding NU7's branch id and activation height to the revision WebZjs already builds on is enough, and
much smaller. **Moving to the released crates is the right long-term fix** and is not done.

## Build

Needs `rustup` (the nightly in `rust-toolchain.toml` is installed on demand), `wasm-pack`, `curl`,
`patch`, and a clang that can target WebAssembly (on macOS: `brew install llvm`).

```sh
npm run wallet:build      # from the repo root; takes about 10 minutes the first time
```

That fetches librustzcash at the pinned revision into `wallet/.deps`, applies the patch, builds
`wallet/pkg`, and copies it to `public/wallet`, where the app loads it. The package is about 60 MB
(55 MB compressed) because it holds the proving parameters.

Native checks of the Rust code (no browser): `RUSTFLAGS='--cfg zcash_unstable="nu7"' cargo check -p webzjs-wallet --no-default-features --features native`.
`examples/probe.rs` syncs a testnet wallet natively and, with `SEND=1`, sends two memos to itself and
reads them back.

[WebZjs]: https://github.com/ZcashCommunityGrants/WebZjs
