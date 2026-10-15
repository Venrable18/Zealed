# Progress

## Phase 1: Project scaffold and tooling (2026-10-07)

**Built**

- Vite 8 + React 19 + TypeScript 6.0 (strict, plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), ESLint (typescript-eslint `strictTypeChecked`), Prettier.
- Tailwind 4, React Router 8 (root layout, home, not-found), Zustand settings store
  (demo flag only).
- `src/config/network.ts` (testnet light-wallet endpoints and drand quicknet; the single
  source for allowed origins), `constants.ts` (denominations, size caps, guardian limits),
  `demo.ts` (`?demo=1` / `?demo=0`, standard and demo timers, overrides).
- `src/config/securityHeaders.ts` builds the CSP from `network.ts` plus COOP, COEP,
  Referrer-Policy and nosniff. The same headers are sent by the dev server and
  `vite preview`, and written to `dist/_headers` for Cloudflare Pages / Netlify.
- `no-console: error` lint rule for app code.
- Vitest (15 unit tests for config, CSP and constants) and Playwright (4 tests, run against
  both the dev server and the production build).
- GitHub Actions CI: lint, format check, typecheck, unit tests, build; separate e2e job.
- `docs/CAPABILITIES.md`, `docs/THREAT_MODEL.md`, this file.

**Verified locally**

- `npm run lint`, `format:check`, `typecheck`, `test`, `build` all pass.
- `npm run test:e2e`: 8/8 pass (4 tests × dev and preview) in Chromium. Response headers
  verified in the browser: COOP `same-origin`, COEP `require-corp`, `crossOriginIsolated`
  is `true`, CSP `connect-src` equals `'self'` + the `network.ts` origins, no CSP violations
  or console errors on load, no requests to other origins, and a `fetch` to a non-allowlisted
  host is blocked with a `connect-src` violation.
- The lint rule rejects a `console.log` in `src/`.

**Open issues**

- CI has not run on GitHub yet: the repo has no remote and nothing is committed.
- Headers checked in Chromium only, not Firefox or Safari.
- The plan's `@chainsafe/webzjs-wallet` package does not exist on npm; Phase 2 must choose
  the WebZjs source (see `CAPABILITIES.md`).
- No fallback light-wallet endpoint yet (ChainSafe's proxy now redirects to a native gRPC
  server). Added in Phase 2/15.

## Phase 2: WebZjs capability audit (2026-10-07): STOPPED AT GATE

**Done**

- Found where WebZjs lives now. `@chainsafe/webzjs-wallet` is not on npm. ChainSafe's repo
  is superseded by ZcashCommunityGrants/WebZjs (red.dev handover, NU6.3/Ironwood).
- Verified the primary endpoint over gRPC-web and decoded `GetLightdInfo`: testnet height
  4,475,856, consensus branch `77190ad9` (NU7, activated 2026-10-04 at 4,465,026).
- Read both WebZjs codebases against the Zealed requirements.

**Gate: failed, two blockers** (details and options in `CAPABILITIES.md`):

1. No WebZjs build supports testnet's current consensus (NU7). Orchard is also closed to new
   value since NU6.3, so the older ChainSafe code is unusable.
2. Neither fork can send a memo or several outputs in one transaction, and the history API
   drops non-text memos.

**Correction:** a first pass earlier today said "Ironwood" was not a known pool and
recommended forking ChainSafe. Both were wrong. Ironwood is the NU6.3 shielded pool, and any
fork must start from ZCG's code.

**Not done:** WASM build, sync, wallet create/restore, faucet funding, live send/receive.
No Zealed code changed in this phase. Waiting for the human to choose a fallback.

## Phase 4: Zealed Memo Protocol (2026-10-14)

Built out of order: Phase 2 is still stopped at its gate, so Phase 3 (wallet core) is blocked.
Phase 4 needs no wallet or network, so it was built and tested on its own.

**Built** (`src/zmp/`)

- `types.ts`: wire layout, constants, the eight message types.
- `codec.ts`: `encodeChunk` (throws on invalid input) and `decodeMemo` (never throws; returns
  `chunk`, `not-zmp` or `malformed` with a reason). Decoding is strict, so each chunk has one
  valid encoding.
- `chunking.ts`: `splitMessage`, `newMessageId`.
- `reassembler.ts`: collects chunks by message ID in any order; handles duplicates, conflicting
  duplicates and header mismatches; memory is bounded (64 partial messages, 256 remembered
  deliveries); each message is delivered once.
- `inbox.ts`: `createInbox(handlers)` decodes raw memo bytes, reassembles, and routes by type.
  Non-ZMP memos are ignored. Outcomes carry no memo content.
- `zmp.test.ts`: 32 tests, including seeded fuzz runs: 300 random round-trips in random chunk
  order, 5,000 random memos, 2,000 corrupted valid memos, 3,000 random memos through the inbox.

**Change from the plan (section 3.1)**: the header has a 2-byte payload length (header is 26
bytes, so 486 payload bytes per memo). Without it a payload ending in zeros cannot be told from
padding. Cap: 16 chunks (7,776 bytes) per message, above the 2 KB feature caps plus AES-GCM
overhead.

**Verified locally**

- ZIP 302 checked against zips.z.cash: first byte `0xFF` is arbitrary data; text is `0x00`
  to `0xF4`, empty is `0xF6` plus zeros, `0xF5` and `0xF7` to `0xFE` are reserved.
- `lint`, `format:check`, `typecheck`, `test` (47 passing) and `build` all pass.
- ESLint now allows `!` in test files only.

**Not verified**

- The Phase 4 "done when": a 2 KB payload reassembled on a receiving wallet **on testnet**.
  This needs memo sending, which is blocked on the WebZjs tooling. Unit tests cover 2 KB across
  chunks only in memory.
- Playwright e2e was not rerun (no app code changed).

**Known limits**

- Chunks are not authenticated: anyone can send a chunk for any message ID. Sensitive payloads
  must be AES-GCM encrypted above this layer. On disagreement the first chunk received wins.
- Per-type size caps (wish 140 chars, letter 2 KB) are not enforced here; features enforce them.

## Phase 5: App shell and design system (2026-10-14)

Built without the wallet, so it is not blocked by Phase 2. Feature pages are honest
placeholders ("Not available yet"); nothing here sends, stores or fakes a transaction.

**Built**

- **Tokens** (`src/index.css`): semantic colors (page, surface, ink, muted, seal, good, warn,
  bad, focus) as CSS variables mapped into Tailwind 4 with `@theme inline`. Light and dark
  themes follow the device by default; Settings can force either (`data-theme` on `<html>`,
  saved with the other non-sensitive settings). Fonts are self-hosted (Inter, Fraunces).
- **Layout and routes**: skip link, header, main navigation, home with the three feature cards
  (from one list in `src/app/features.tsx`), Legacy, Blind Pot, Unsigned, Dashboard, Settings
  (theme, demo mode, about), and a component gallery at `/components`.
- **Shared components** (`src/components/`): Button, TextInput, TextArea, AmountInput (ZEC),
  FeePreview, ConfirmDialog (native `<dialog>`), QrDisplay, QrScanner, CountdownTimer,
  EmptyState, toasts (`toastStore` + `ToastViewport`).
- **Logic** (`src/lib/`): `parseZec` / `formatZec` (bigint, 8 decimals, supply cap) and the
  countdown math, with unit tests.

**Verified locally**

- `lint`, `format:check`, `typecheck`, `build` pass; unit tests 74 passing.
- Playwright: 76 passing (dev server and production build). New coverage: every route renders
  with no console errors or CSP violations (so fonts load under the CSP); navigation and
  current-page marking; theme switching and persistence; no sideways scroll at 360px on every
  route; axe-core WCAG 2.x A/AA including color contrast, every route in light and dark at
  360px; amount input errors and total; dialog focus, Escape and confirm; toast behaviour;
  countdown ticking; QR drawn; scanner opens a (fake) camera and its tracks end on cancel.
- Screenshots checked by eye at desktop and 360px, light and dark.

**Not verified**

- Scanning a real QR code. The fake camera test proves the camera opens and closes, not that
  `jsqr` decodes a code. Needs a manual check on a phone, or a test image fed to the decoder.
- Firefox and Safari (Chromium only, as before).
- `FeePreview` shows a fee it is given; the real ZIP 317 fee will come from the wallet.
- Axe checks automated rules only. A manual screen-reader pass has not been done.

**Notes**

- Added dependencies: `qrcode`, `jsqr`, `@fontsource-variable/inter`,
  `@fontsource-variable/fraunces`; dev: `@types/qrcode`, `@axe-core/playwright`. See
  `CAPABILITIES.md`.
- `no-non-null-assertion` stays on for app code (off in tests only, from Phase 4).
- The component gallery ships in production builds on purpose, so judges can see the design
  system. Remove the route if that is not wanted.

## Phase 6: Blind Pot, host side (2026-10-14): PARTIAL, wallet parts blocked

Built everything that does not need a wallet, against an interface the wallet must provide
(`PotWalletPort`, see `CAPABILITIES.md`). The phase's "done when" (payments sent from another
wallet appear only as a batched total and wishes) is **not met and cannot be tested yet**.

**Built** (`src/features/blindpot/`, routes `/blind-pot` and `/blind-pot/:id`)

- **Create pot**: name, cover emoji, event date, last day for gifts, with plain-language
  validation (`pot.ts`, `CreatePotForm`). The refresh interval comes from the timers (60 minutes,
  60 seconds in demo mode) and is fixed per pot.
- **Share**: pot link with the data in the URL **fragment** (`shareLink.ts`), strict decoder for
  untrusted links, link and QR (`SharePot`). A separate ZIP 321 QR for other wallets, labelled
  "weaker privacy". ZIP 321 grammar checked against zips.z.cash.
- **Host view**: total as of the last **batch boundary**, privacy strength band, wishes, a
  countdown to the next update, and Close pot (`hostView.ts`, `HostViewPanel`).
  - The wallet is read **as of the boundary**, not now, so the same answer shows however often the
    host looks within a batch, and later gifts stay hidden until the next boundary.
  - Wishes come from ZMP `WISH` memos, validated (140 characters, no control or bidi-override
    characters), shuffled deterministically per batch, shown with no times or amounts.
  - The wallet interface returns aggregates and bare memos only, so no screen can list payments.
- **Pot list/store**: in memory only (`potStore.ts`), lost on reload. Not written to
  localStorage because pot names and dates are private. Wallet storage (Phase 3) will persist.

**Verified locally**

- `lint`, `format:check`, `typecheck`, `build` pass. 112 unit and screen tests, 92 Playwright
  tests (dev and production build) pass, including axe checks on the new pages at 360px.
- Tests use `FakeWallet`, a **test double** in `fakeWallet.ts` that app code never imports. They
  prove the boundary rule, shuffling, wish validation, hostile-link rejection, close and failure
  paths, and that the host view exposes only `totalZat`, `strength`, `wishes` and two times.
- With no wallet the app says so ("The wallet is still being built") and refuses to create a pot.
  Nothing is faked in the shipped app.

**Not done / blocked on the wallet (Phase 3 and the WebZjs tooling)**

- Creating the pot's account and address; reading real balance, piece counts and memos as of a
  chain time; withdrawing to the main account.
- Whether WebZjs gives each pot its own account (otherwise a wallet per pot).
- Real address validation (links only check the address shape).
- Booking the "as of" time against chain block times (NU7 blocks are 25 s) rather than the
  device clock.
- The contribution page the link opens (`/blind-pot/give`) is Phase 7; the link points to it
  now but it shows "Page not found".

**Notes**

- Privacy strength cut-offs (6 and 24 pieces) are a heuristic; see `strength.ts`.
- Added dev dependencies: `jsdom`, `@testing-library/react`, `@testing-library/dom`. Test
  timeout raised to 20 s in `vite.config.ts` (the Phase 4 fuzz tests timed out under load).

## Phase 7: Blind Pot, contributor side (2026-10-14): PARTIAL, sending blocked on the wallet

Same approach as Phase 6: everything that does not need a wallet is built and tested; sending
goes through `ContributorWalletPort`. The phase's "done when" (three contributors fund a pot and
the host sees only the batched total and shuffled wishes) is **not met and cannot be tested yet**.

**Built** (`src/features/blindpot/`, route `/blind-pot/give`)

- **Splitter** (`splitter.ts`): greedy split into the 1-2-5 pieces, at most 6. Amounts that do
  not fit are rounded to the **nearest** total that does (ties round down), and the screen shows
  the exact amount sent. Gifts are capped at 60 ZEC (6 x 10), and under 0.001 ZEC is refused.
- **Wish piece**: with a wish, one 0.001 piece is reserved for it, so the rest is rounded to fit
  five pieces. A 0.5 gift with a wish therefore becomes 0.501 (shown to the guest before sending).
  The wish piece's position in the sending order is shuffled.
- **Wish memo** (`wishMemo.ts`): a ZMP `WISH` message in one memo. Wishes the host would drop
  (over 140 characters, too many bytes once emoji are counted, control or bidi characters) are
  refused up front with a message.
- **Send queue** (`queue.ts`): one transaction per piece, strictly one at a time and in order,
  the first at once and each later one after a random extra delay (demo timers 2 to 10 s, standard
  1 to 5 min). Not-spendable-yet is retried after 30 s without counting as a failure; running out
  of funds pauses with a Continue button; other failures retry up to 3 times, then Try again.
  Pieces already sent are kept.
- **Gift screen** (`GiftFlow.tsx`): amount and wish, exact-amount preview, a confirmation, a
  balance check, progress ("3 of 6 pieces sent"), a keep-the-page-open notice, and a receipt
  showing only the guest's own gift. A pot past its last day takes no gifts.
- **Link page**: reads the pot from the URL fragment; a broken, missing or oversized link shows
  "This link does not look right"; pot names render as plain text.

**Verified locally**

- `lint`, `format:check`, `typecheck`, `build` pass. 141 unit and screen tests and 110
  Playwright tests (dev and production build) pass, including axe checks at 360px in both themes.
- The splitter is checked against an **exhaustive brute-force** search of every reachable total
  (400 random amounts, with and without a wish), plus 3,000 seeded property checks (standard
  pieces only, exact sums, at most 6 pieces, exactly one wish carrier).
- Queue and screen tests use `FakeContributorWallet`, a **test double** that app code never
  imports. They prove: separate sends per piece, the memo only on the 0.001 piece and decodable
  by the host, retry/blocked/failed paths, and a private receipt.
- With no wallet the page says so and sends nothing. The pot data is never sent to the server.

**Not done / blocked**

- Sending: no real transaction has been made. Needs the wallet and the WebZjs tooling (memo
  send, spendable-balance and change-note timing).
- **Resuming after a reload**: the queue is saved through `ContributionStore`, but only an
  in-memory store exists, because the queue holds the address, amounts and wish and must be
  stored encrypted (Phase 3). The screen therefore tells guests to keep the page open and does
  not promise resuming.
- **Onboarding shortcut** (create a wallet and get faucet funds inside the flow): needs the
  wallet. Not started.
- Whether the real wallet reports "not spendable yet" separately from other failures, and
  whether a 25 s NU7 block time makes the 1 to 5 minute delays long enough or too long.
- Fees: the balance check compares against the gift only; each piece also pays a ZIP 317 fee.
  The screen says "plus a small fee" but cannot show it until the wallet can propose a payment.

**Notes**

- The fixed piece sizes make equal gifts split identically. That is intended (section 3.2), but
  it means the set of pieces reveals the amount to anyone who can see them all together; the
  privacy comes from separate transactions, timing and the host never seeing individual notes.
- The production bundle is now over Vite's 500 kB warning size. Not a failure; revisit when the
  WebZjs bundle is added.

## Phase 8: Legacy crypto foundations (2026-10-15)

Needs no wallet, so it is built and verified in full, including the plan's "done when": a tlock
round trip against the live drand network.

**Built** (`src/crypto/`)

- `aes.ts`: AES-256-GCM through WebCrypto. Random 96-bit IV per message (a fresh key per bundle),
  optional associated data, a key commitment (SHA-256 with a domain label).
- `tlock.ts`: lock a key to a drand quicknet round and open it once the round is published.
  Date to round uses the **first round at or after** the chosen time, so it never opens early.
  Demo-mode delays work (30 s is 10 rounds). Wraps `tlock-js`, which verifies every beacon.
- `shamir.ts`: split and combine with 2 to 5 shares, threshold 2 up to the total. Each share is
  wrapped with threshold and total so **too few shares is refused** (the library alone would
  silently return a wrong key).
- `sign.ts`: Ed25519 check-ins and revokes with separate domain tags, a monotonic counter, and
  a `CheckInTracker` for guardians that refuses invalid, wrong-bundle, replayed and future-dated
  check-ins, and is unchanged by a rejected one.
- `bundle.ts`: versioned binary format. Mode A (timelock) and Mode B (guardians, with the share
  policy and a key commitment). The header is authenticated, so a ciphertext cannot be moved into
  another bundle. Decoders return null on bad input and never throw. `sealTimelocked`,
  `openTimelocked`, `sealForGuardians`, `openWithShares` tie it together.
- Errors are `CryptoError` with a fixed code and no secret-bearing text.

**Verified**

- `lint`, `format:check`, `typecheck`, `build`, `npm audit` (0 vulnerabilities). 178 unit tests
  and 112 Playwright tests pass; the 2 live tests are opt-in.
- **Live drand** (`npm run test:live`, about 30 s): locks a key 10 s ahead, confirms the device
  clock refuses early, confirms the **network itself refuses an unpublished round**, waits, then
  opens it; also seals and opens a whole Mode A bundle. Only `https://api.drand.sh` was contacted.
- **Offline timelock tests** use two real, public past quicknet beacons recorded in
  `fixtures/quicknet-beacons.json` (fetched 2026-10-15). They cover: opens at the round, early
  and unpublished rounds fail, and a beacon from a different round cannot open a key.
- **Failure cases**: wrong key, any flipped byte, wrong associated data, wrong key size, too few
  shares, repeated or mismatched shares, shares from another bundle, forged and replayed
  check-ins, a check-in used as a revoke, tampered header, ciphertext or policy.
- **Seeded fuzz**: 3,000 rounds of random and corrupted bundles, policies and check-ins never
  throw.
- **Browser**: the same flows were bundled with Vite and run in Chromium under the app's CSP
  (dev and production build), with no console errors.

**Notes and limits**

- Mode B policy: the heir sees the owner's check-in public key and the share policy; it contains
  no secrets, only a key commitment.
- The date-to-round clock check uses the device clock; the real gate is cryptographic. A device
  with a wrong clock may see "not yet" late or try early and fail with `unlock-failed`.
- JavaScript cannot reliably erase keys from memory; private keys and content keys live only as
  long as the code holds them. Callers must not log or persist them unencrypted.
- The timelock fixture client (`testClient.ts`) and `browserCheck.entry.ts` are test-only and
  never imported by the app.
- Corrected an earlier note: `tlock-js` installs `drand-client` 1.2.5, not 1.4.2.
- The seed phrase goes inside the sealed content; Phase 9 builds the gift wallet and its use.

**Not done (later phases)**: any UI, sending bundles or shares as memos, guardians' app logic
(alerts, nudges, release), and key storage. Those need the wallet (Phases 3 and 9 to 10).
