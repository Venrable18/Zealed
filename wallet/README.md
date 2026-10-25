# Zealed wallet (WebAssembly)

The Zcash wallet Zealed runs in the browser. It is built from [WebZjs] (the browser wallet library
now maintained by red.dev / Zcash Community Grants), changed so it works on today's testnet.

**Verified on the live NU7 testnet (2026-10-24)**, natively and in Chromium: sync; receiving an
Ironwood payment from another wallet; sending one transaction with two memos to itself and reading
both memos back; sending zero-value outputs that carry only memos. See "Evidence" below.

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
(`tests/e2e/wallet.send.live.spec.ts`), and so do all three features, each between two wallets in two browsers
(`tests/e2e/{unsigned,legacy,blindpot}.live.spec.ts`, about 4 minutes each):

- **Unsigned**: card, paid message, message read, reply paid from what arrived, reply read.
- **Legacy**: a letter with a 0.001 TAZ gift is sealed (gift wallet funded first, then the letter),
  found by the recipient, opened with the real drand key, and the gift is moved into the recipient's
  wallet (found from the block the letter says the gift wallet was made at).
- **Blind Pot**: a pot account is created; a guest gives 0.003 TAZ with a wish as standard-size
  pieces in separate transactions; the host sees only the total and the wish, then withdraws.

[WebZjs]: https://github.com/ZcashCommunityGrants/WebZjs
