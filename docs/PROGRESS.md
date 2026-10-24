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

## Phase 9: Legacy Mode A, open on a date (2026-10-16): PARTIAL, wallet parts blocked

Everything that does not need a wallet is built, using the real Phase 8 crypto, and tested end to
end. Anything touching money or delivery goes through `LegacyWalletPort`. The phase's "done when"
(in demo mode, a letter and funds sealed 30 seconds ahead open on the recipient's side and the
funds are swept) is **not met with a real wallet**; it is covered by a test with a test-double
wallet and recorded beacons.

**Built** (`src/features/legacy/`, route `/legacy`, loaded on demand)

- **Compose** (`ComposeLetter`, `validate.ts`): recipient address, letter (up to 2,048 **bytes**,
  with a live count), optional gift, unlock date and time. In demo mode the time starts 30 s
  ahead, otherwise about a year. Unlock must be 15 s to 50 years ahead. The fee is shown before
  anything happens, and a confirmation names the recipient, the date, the gift and the fee.
- **Seal and send** (`seal.ts`): creates the gift wallet, puts its seed inside the encrypted
  letter, timelocks the key, splits the bundle into `SEALED_BUNDLE` memos. **The gift is funded
  before the letter is delivered**, so a recipient cannot open a letter whose funds are missing.
  If delivery fails after funding, the item keeps the memos and the seed so it can be retried and
  the funds recovered; both are dropped once delivery succeeds.
- **Recipient inbox** (`inbox.ts`, `InboxList`): finds sealed letters in received memos (once each;
  ignores other messages, other types and guardian bundles), shows "Sealed until ..." with a
  countdown, and a disabled Open button until the time. At the time it fetches the drand round,
  decrypts, and shows the letter as plain text. If there is a gift, one tap sweeps it.
- **Sender view** (`SentList`): lists letters as "Sent" or "Not delivered" (with Retry). It never
  claims "opened", and says Zealed cannot know that.
- Every failure has its own plain message: drand unreachable (can retry), damaged letter, nothing
  to sweep, not ready, wallet error. Failure messages carry no secrets.

**Verified**

- `lint`, `format:check`, `typecheck`, `build`. 217 unit and screen tests and 132 Playwright tests
  pass (dev and production build), including axe at 360px in both themes.
- Logic tests run the **real crypto** (AES, tlock) against the recorded drand beacons from Phase 8:
  funding happens before sending; nothing on the wire contains the letter or seed; a letter does
  not open early even when the network could answer; a different round's beacon cannot open it;
  invalid input never touches the wallet; each failure path (gift wallet, sealing, funding,
  delivery, retry, sweep) behaves as documented; and the 30-second demo scenario.
- A hostile letter (`<img onerror>`) renders as plain text.
- The new page makes no network calls of its own and sends none of the letter's content.

**Not done / blocked on the wallet (Phase 3 and the WebZjs tooling)**

- Everything in `LegacyWalletPort`: fee estimate, creating the gift wallet, funding it, sending
  several memos in one transaction, reading received memos, restoring the gift wallet from its seed
  and sweeping it. With no wallet the page says so and does nothing.
- Real address validation (only the shape is checked).
- Persistence: sent items and the inbox are in memory only. Sent items can hold a gift seed, so
  they must go to encrypted storage (Phase 3), never plaintext.
- A live run with a real drand round and a real wallet.

**Notes**

- Added `src/test/nodeGlobals.ts` (test-only). jsdom lacks `crypto.subtle` and has its own
  `Uint8Array`, which makes tlock-js reject bytes; real browsers do not have either problem, and
  the Chromium test from Phase 8 proves the same flows there.
- The Legacy page is lazy-loaded: tlock-js adds about 275 kB (96 kB gzip), so only people who open
  Legacy download it. The main bundle is unchanged.
- The fee preview estimates memo count from the letter size plus about 1.5 KB of sealing overhead;
  the real count comes from the wallet's proposal.
- If the recipient never opens the letter, the sender cannot reclaim the gift (they do not keep
  the seed after delivery). That is by design for this mode, but the UI should say so; not yet.

## Phase 10: Legacy Mode B, open if I go silent (2026-10-16): PARTIAL, wallet parts blocked

Everything that does not need a wallet is built and tested end to end with the real crypto. Sending
and receiving go through `LegacyWalletPort` (one added method: `ownAddress`). The phase's "done when"
is covered by a test with test-double wallets (see below), not with a real wallet and chain.

**Built** (`src/features/legacy/silent/`, route `/legacy/silent`, loaded on demand)

- **Messages** (`messages.ts`): `SHARE` (policy + share + owner address, checked to agree with
  itself), `SHARE_RELEASE`, `NUDGE`; strict decoders that never throw. `CHECKIN` and `REVOKE` carry
  the signed payloads from Phase 8.
- **Owner** (`owner.ts`): setup (validate, seal, fund, deliver the letter to the heir and a share +
  policy + first check-in to each guardian), one-tap check-in, revoke, retry of unsent messages,
  reminder counting. Everything unsent is kept so it can be retried; the gift seed is kept only
  until everything is delivered.
- **Guardian** (`guardian.ts`): records per letter, status OK / overdue / releasing / released /
  revoked, check-in verification (signature, bundle, rising counter, not future-dated), revoke
  handling, reminders only while overdue, release only after the grace period, share erased after
  release or revoke. Memos are applied in a fixed order, so results do not depend on arrival order.
- **Heir** (`heir.ts`): collects shares per letter ("1 of 2 shares"), tries every group of `t`
  shares so a bogus share cannot block opening, then opens and sweeps the gift.
- **Screens**: setup form (heir, 2 to 5 guardians, threshold, check-in and grace periods in friendly
  units, letter, optional gift, confirmation), owner cards (next check-in countdown, overdue alert,
  Check in, Revoke with confirmation, reminder count, Retry), guardian cards (status, countdown,
  Remind, Release with confirmation, automatic release in demo mode), heir cards (progress, Open,
  sweep), and a Check for messages button. The Legacy page links to it.
- **Crypto additions**: `inspectShare` (read a share's header) and a restorable `CheckInTracker`
  state, so replays stay refused across visits.
- `docs/THREAT_MODEL.md` now has the Mode B analysis: who can do what, the controls and where they
  are tested, and nine known limitations including collusion and "guardians act when they open the
  app".

**Verified**

- `lint`, `format:check`, `typecheck`, `build`. 269 unit and screen tests (plus 2 opt-in live tests) and 156 Playwright tests
  pass (dev and production build), including axe at 360px in both themes.
- **Demo scenario** (`silent.test.ts`): owner checks in once then stops; one second before `P + G`
  nothing is released; after it, two guardians release; the heir opens the letter and claims the
  funds. A forged check-in at the last minute is rejected and changes nothing. A second test shows
  no release while the owner keeps checking in.
- Forged, replayed, old-counter, wrong-bundle and future-dated check-ins; forged and late revokes;
  releases before the grace period; shares for other letters; bogus shares mixed with real ones;
  any 2 of 3 guardians opening the letter; one guardian never being enough; malformed messages
  (3,000-round seeded fuzz); partial delivery and retry.
- Screens against several fake wallets on one fake network acting as owner, guardians and heir.

**Not done / blocked**

- A real wallet and chain: sending several memos per transaction, reading received memos, the gift
  wallet, `ownAddress`. See `CAPABILITIES.md`.
- Persistence: everything is in memory. The owner's check-in private key, guardians' shares and the
  heir's shares must go only to encrypted storage (Phase 3).
- A live run with real wallets and real timers.
- Background operation is impossible in a browser; guardians must open the app (documented).
- No UI yet to edit a letter in place: revising is revoke then seal a new one, as planned.

**Notes**

- Reminders and releases are built fresh each time (new message ID), so a second reminder counts.
- When a guardian first receives a share, the owner's first check-in arrives with it, so the clock
  starts from setup.

## Phase 11: Unsigned, recipient side (2026-10-18): PARTIAL, wallet parts blocked

Everything that does not need a wallet is built and tested; the wallet is reached through
`UnsignedWalletPort`. The phase's "done when" (a message sent from another wallet appears correctly
reassembled in the inbox and an underpaid message is filtered) is covered by a test with a
test-double wallet; it has not been run with a real wallet and chain.

**Built** (`src/features/unsigned/`, route `/unsigned`)

- **Contact card** (`card.ts`, `CreateCardForm`): display name (60 characters, one line), bio (280),
  minimum payment (0.001 to 100 ZEC), replies on or off; plain-language errors; the card gets a
  fresh address from the wallet.
- **Share** (`cardLink.ts`, `ShareCard`): link `/u#<card>` with everything in the URL fragment, a QR
  code, copy button; a strict decoder for untrusted links. The sender page (`/u`) is Phase 12.
- **Message format** (`format.ts`): version, flags, optional reply-to address, optional 32-byte
  commitment (for Phase 12's stretch receipt), then the text. At most 2,048 bytes, no control or
  bidi characters, exactly one valid encoding; strict decoder that never throws.
- **Inbox** (`inbox.ts`, `InboxPanel`): reassembles `UNSIGNED_MSG`, shows amount and block time,
  newest first, stable ids across rescans, underpaid messages in a closed "Below minimum" folder.
  **Each payment pays for one message**: extra messages in the same payment count as unpaid.
- **Earnings**: total paid through the card, messages that met the minimum, and what the hidden
  folder holds (included in the total).
- **Reply** (`service.ts`, `ReplyBox`): only where the sender left an address and the card allows
  replies; up to 2 KB; sent as a message with no reply address of its own.
- `docs/THREAT_MODEL.md` has a recipient-side section with six known limitations.

**Verified**

- `lint`, `format:check`, `typecheck`, `build`, `npm audit` (0). 307 unit and screen tests (plus 2
  opt-in live tests) and 168 Playwright tests pass (dev and production build), including axe at
  360px in both themes.
- Logic: a 2 KB message split across many memos reassembles with its amount and time; underpaid,
  exactly-minimum and one-zatoshi-short cases; bundled messages; non-Zealed, other-type, malformed
  and unsafe memos ignored; link and message decoders reject hostile input and never throw (4,000
  seeded fuzz rounds); card and reply validation; failure paths.
- Screens, with the test wallet: errors, share view, inbox, hidden folder (closed by default),
  earnings, reply flow and its errors, replies off, wallet missing or failing, text shown as text.

**Not done / blocked on the wallet (Phase 3 and the WebZjs tooling)**

- `newAddress()`, `receivedTransactions(address)` (amount, block time and memos per transaction),
  `estimateFee`, `sendMemos`. See `CAPABILITIES.md`.
- Persistence: card and messages are in memory only; they must go to encrypted storage.
- A live run with a real wallet, real block times and real fees.

**Notes**

- Removed the unused "not available yet" placeholder page (`FeaturePage`) and its browser test now
  that all three features have real pages.
- Added `src/zmp/memos.ts` (`toMemos`) and `src/lib/base64url.ts` as shared helpers.
- The card link points to `/u`, which shows "Page not found" until Phase 12, as the Blind Pot link
  did until Phase 7.
- The main bundle grew from 519 kB to 534 kB (Unsigned is not lazy-loaded; it is small).

## Phase 12: Unsigned, sender side (2026-10-18): PARTIAL, wallet parts blocked

Everything that does not need a wallet is built and tested. Sending and reading replies go through
`UnsignedWalletPort` (two methods added: `spendableZat`, `sendPayment`). The phase's "done when" (an
anonymous sender with a fresh wallet sends a paid message, the recipient reads it, and if enabled
replies) is covered end to end by a test with two test-double wallets on one fake network; it has not
been run with a real wallet and chain.

**Built** (`src/features/unsigned/`, route `/u`)

- **Card page** (`/u#<card>`, `Send.tsx`): reads the card from the URL fragment and shows name, bio,
  minimum and whether replies are accepted. A broken, missing or oversized link says so; hostile
  names and bios render as plain text.
- **Privacy guidance** (`PrivacyGuidance`): always visible; separate wallet, no identifying details,
  Tor Browser (with the "Safest" mode and JavaScript caveat), amounts and timing, reply addresses.
- **Compose and send** (`SendForm`, `send.ts`): message up to 2,048 bytes with a live count, payment
  (at least the minimum), optional reply address, optional receipt, fee preview, a confirmation, a
  balance check. One transaction carries the payment and all the memos.
- **Replies**: a **fresh** address per message from the wallet, never reused and never the main
  address; none if the card turned replies off. "Check for replies" reads that address.
- **Receipt (stretch)** (`receipt.ts`): `SHA-256(salt || message)` in the memo, a downloadable
  receipt file (no message text in it), and a **Verify a receipt** screen on the recipient page that
  matches a revealed message and salt (or a whole pasted receipt) against inbox commitments.
- **Sent list** (`SentMessages`): this device only; message text kept only when a receipt was asked
  for.
- `docs/THREAT_MODEL.md` has the sender-side section: controls, how the commitment hides and binds,
  and seven known limitations.

**Verified**

- `lint`, `format:check`, `typecheck`, `build`, `npm audit` (0). 341 unit and screen tests (plus 2
  opt-in live tests) and 188 Playwright tests pass (dev and production build), including axe at 360px
  in both themes.
- **End to end, two wallets**: a sender sends a paid message, the recipient reads it (amount, text,
  reply address), replies, and the sender finds the reply at their fresh address; a long message is
  one transaction with several memos; replies off means no address is made; two messages get two
  different reply addresses.
- **Nothing happens without every check**: invalid input, no wallet, too little money, a balance
  read failing and a failed send all leave nothing paid.
- **Receipts**: the commitment changes with the message or salt; a sent message with a receipt is
  matched by the recipient; a changed message is not; whitespace is handled the same on both sides;
  hostile receipt files are rejected and never throw (seeded fuzz); the downloaded file parses and
  holds no message text.
- The card and message are never sent to the server (browser test over every request).

**Not done / blocked on the wallet**

- `newAddress`, `spendableZat`, `estimateFee`, `sendPayment` (a payment with memos in one
  transaction), `receivedTransactions`. See `CAPABILITIES.md`.
- Persistence: the sent list and any kept message text are in memory; they must be stored encrypted.
- A live run with a real wallet, real block times and fees.
- The receipt download has been tested with a stand-in for the browser's save, not in a real browser
  under the page's CSP.
- There is no link to `/u` in the navigation on purpose: it is reached through a card link.

**Notes**

- Test wallets now share one address counter so two fake wallets never hand out the same address.
- The main bundle grew to 549 kB (the sender page is small and not lazy-loaded).

## Phase 13: Dashboard and settings (2026-10-19): PARTIAL, wallet parts blocked

The dashboard is computed entirely from local data and is complete for what exists today. Parts that
need the wallet (balance, seed export, auto-lock) are built and tested against interfaces; the
server health check and the wipe are fully real and verified.

**Built**

- **Dashboard** (`src/features/dashboard/`, route `/dashboard`, loaded on demand): wallet balance;
  Blind Pot (pots open and closed, each pot's total and privacy strength **as of its last batch**,
  total across pots); Legacy (letters sent and not delivered, sealed for you with ready and locked
  counts, letters if you go silent with a **countdown to the next check-in and an overdue alert**,
  people you guard by status, letters waiting for you); Unsigned (card, messages received, below
  minimum, earnings, messages sent). The banner reads "Your dashboard is computed on this device. We
  can't see it." `computeDashboard` is a pure function; a Refresh button reloads balance and totals.
- **Server health check** (`src/lib/lightwalletd.ts`, `EndpointSettings`): a small gRPC-web client
  (no new dependency) calling `GetLightdInfo`. Reports height, network upgrade and speed; refuses a
  mainnet server; explains unreachable, timeout and bad responses. Runs only on a button press.
- **Settings**: server selection (only configured servers), auto-lock (1, 5, 15, 30, 60 minutes, no
  "never"), seed export with passphrase re-entry (`SeedExport`), wipe all local data with a typed
  word (`WipeData`, `wipe.ts`). Saved settings are validated when loaded.

**Verified**

- `lint`, `format:check`, `typecheck`, `build`, `npm audit` (0). 393 unit and screen tests (plus 3
  opt-in live tests) and 210 Playwright tests (plus 2 opt-in live) pass in dev and production build,
  including axe at 360px in both themes.
- **Correct numbers after the earlier scenarios**: `scenario.ts` replays the Blind Pot, Legacy Mode
  A and B and Unsigned flows with the real logic and test-double wallets; tests check every figure
  against values worked out by hand (including that a gift after the last batch is not counted, that
  one guardian can hold one letter that is fine and one that is releasing, and that the numbers move
  with the clock). The same data renders correctly in the screen through the hook.
- **No network from the dashboard**: a source scan (no fetch, XHR, WebSocket, beacon, worker, or
  imports of the network, drand, tlock or lightwalletd modules), and a browser test: opened from
  inside the app it downloads only its own code files, makes no non-GET request and no request to
  any light-wallet server or drand; once loaded, refreshing and waiting produce zero requests.
- **Live**: `npm run test:live` now also checks the real testnet server from Node and from a real
  Chromium page under the app's CSP and COEP headers: reachable, on testnet, height 4,519,623,
  branch `77190ad9` (NU7), no console errors. This closes the browser CORS/COEP question left open
  since Phase 2.
- **Wipe in a real browser**: after wiping, saved settings, a session value and a test IndexedDB
  database are gone, the theme and auto-lock are back to defaults, and the page is at the start.
- Seed export: a wrong passphrase never reads the seed; the right one shows words with a warning and
  no copy button; hides by itself after a minute and on "Hide now"; five wrong tries pause attempts.

**Not done / blocked on the wallet**

- Balance, `verifyPassphrase`/`exportSeed`, and enforcing auto-lock (the setting is saved only).
- A second server for fallback (only one gRPC-web testnet server is known); selection works with a
  list of one.
- Persisting anything: stores are in memory, so the dashboard starts empty after a reload.

**Notes**

- The dashboard is loaded on demand: it reads Legacy's guardian and heir logic, which pulls in the
  timelock library (about 300 kB). The main bundle stays at about 560 kB.
- `resetAllStores` also clears the in-memory contribution queue (added `clearAll` to the memory
  store).
- Settings that are saved: demo mode, theme, server, auto-lock. Nothing private is among them.

## Phase 14: Hardening and end-to-end testing (2026-10-19): PARTIAL, real-wallet parts blocked

The multi-actor scenarios, the privacy checklist, the error-handling checks and the responsiveness
checks are done against a **simulated chain**. Nothing here runs on testnet: the app has no wallet
yet. The plan's "done when" (all scenarios pass twice in a row, privacy checklist complete) is met
for everything that can be tested without the wallet; the items that need it are listed below.

**Built**

- **Test-only simulation** (never shipped; checked that none of it is in `dist/` or imported by the
  app): `src/test/simChain.ts` (wallets, addresses, payments with memos, real-clock block times,
  a flat fee, a gift-wallet sweep, two failure modes: running out of money and change that is not
  spendable yet), `src/test/simClient.ts` (one wallet object that satisfies every wallet interface
  the app defines), `src/test/harness.entry.tsx` (mounts the **real, unchanged app** with that
  wallet) and `tests/e2e/sim/harness.ts` (builds the harness with Vite and gives each actor its own
  browser context, so storage and memory are separate).
- **Scenarios** (`tests/e2e/scenarios/`, `npm run test:scenarios`, Playwright project `scenarios`,
  production build, real-time demo timers, run in CI in its own job):
  - **Blind Pot**: a host and three guests; nine separate standard-size transactions spread over
    time, the wish on exactly one 0.001 piece; the host sees only the batched total (0.85) and the
    wish, and none of the single gift amounts; then closes the pot.
  - **Legacy Mode A**: seals with a gift (funded before delivery); the recipient cannot open early;
    with drand unreachable the app says so and lets the person retry; **against the real drand
    network** (`LIVE_DRAND=1`) a letter sealed 30 seconds ahead opens and the gift is swept.
  - **Legacy Mode B**: an owner, three guardians (one goes offline), a heir; the owner checks in once
    and stops; a forged check-in just before the deadline does not move it; guardians go overdue then
    release by themselves in demo mode; the heir opens the letter and claims the funds. A second run:
    a forged check-in and forged revoke change nothing, the real owner revokes, every guardian erases
    its share, and nothing can be opened. Junk and malformed memos are sent to every actor.
  - **Unsigned**: a recipient publishes a card; an anonymous sender pays, writes, asks for a reply and
    keeps a receipt; the recipient reads it, an underpaid message goes to the hidden folder, junk is
    ignored, the recipient replies, the sender finds the reply, and the receipt verifies (and a
    changed message does not).
  - **Errors**: not enough money is refused up front; a gift that runs out partway pauses and
    continues after the guest adds funds with nothing lost or repeated; change that is not spendable
    yet is waited for with no error shown.
- **Strict final check for every actor** (`assertClean`; _correction: when this phase was first reported, the no-console, no-Referer and no-private-URL checks were described as enforced but were not actually in the code. They were added afterwards and are now enforced, and fixed real problems they exposed_): only the app's own origin (plus drand where
  allowed) was contacted, **no console message of any kind**, **no Referer** sent to another origin,
  **no address or pot data in any URL**, and storage holds only the five non-sensitive settings, no
  cookies, no session data and no IndexedDB.
- `docs/PRIVACY_CHECKLIST.md`: 12 items with evidence and status (10 met, 1 partly, 1 not met yet; item 2 later became met with caveats, see the storage section below).
- `docs/THREAT_MODEL.md`: the Blind Pot section was missing and is added, plus a review table of what
  each feature protects against and its limits, and what the scenarios did and did not prove.
- Playwright projects: `dev` and `preview` run the quick checks (`npm run test:e2e`), `scenarios`
  runs the long ones (`npm run test:scenarios`). CI has a new `scenarios` job.

**Verified**

- `lint`, `format:check`, `typecheck`, `build`, `npm audit` (0). 393 unit and screen tests (plus 3
  opt-in live) and 210 quick browser tests pass.
- **Scenarios pass twice in a row**: two consecutive full runs, each 8 passed in about 1.7 minutes.
  The live-drand Mode A test passed twice as well (about 35 s each).
- **Responsive**: the longest the main thread was blocked was 61 ms while sealing a 2 KB letter for
  three guardians and 92 ms while timelock-sealing (limit set at 500 ms for slower machines).

**Not done / blocked on the wallet**

- **Scenarios on testnet.** They use the simulated chain. Real transactions, block times (25 s on
  NU7), fees, note maturity, and the WebZjs memo and multi-output API are untested. The simulation
  also shows memos in plain text where the real chain encrypts them.
- **Endpoint down (fallback).** Only one gRPC-web testnet server exists, so there is nothing to fall
  back to. The health check reports an unreachable server (tested in a real browser with the server
  blocked).
- **Sync and proving off the main thread.** There is no sync or proving yet. What exists (crypto
  sealing) was measured and is fast. This must be re-measured and likely moved to a worker when
  WebZjs is added.
- **Encrypted local storage** (privacy checklist item 2).
- **The simulated "faucet"** just gives wallets starting funds; the real faucet flow is untested.

**Notes**

- There is no screen showing a person their own receiving address yet (a Phase 3 receive screen), so
  the scenarios read addresses from the simulated chain and type them in.
- The harness exposes test helpers (`window.__zealed`) only inside the harness page, to build forged
  and underpaid memos and read a guardian's letter ids; none of that is in the shipped app.
- `test:e2e` now runs only the `dev` and `preview` projects.

## Storage, contacts and receive (2026-10-20): done for what needs no wallet

**Built**

- **Encrypted vault** (`src/storage/`): opt-in passphrase, PBKDF2-SHA256 (600,000 rounds), in-memory
  non-extractable AES-GCM key, one encrypted record per store, IndexedDB `zealed-vault` created only
  after a passphrase is chosen. Lock screen, real auto-lock (wipes in-memory private data and any
  toast text), change passphrase, wrong-passphrase limit, wipe-everything deletes the database.
  Reloading locks by design. Settings has the controls; every page warns while nothing is saved.
- **Persistence of all stores**: pots, contributions, letters, shares, check-in keys, unsigned
  messages, sent list, contacts. A gift is saved as "sending" before the wallet call; if the page
  closes mid-send it comes back as "unconfirmed" and the guest decides, so money is never sent twice
  by accident.
- **Receive screen** (address as text and QR, copy), **Contacts** (add, rename, remove, a shareable
  link that carries the address in the URL fragment, never sent to a server), and a shared address
  field that accepts typing, a saved contact, paste, scanning, a `zcash:` request or a contact link.
  Used for the letter recipient, the heir and guardians.
- Fixed while testing: an empty database was created on every load; wipe left a connection open so
  deletion was blocked; a toast with a contact name stayed on the lock screen; toast markup failed
  an accessibility rule; a router warning on lazy routes.

**Verified**: `lint`, `format:check`, `typecheck`, `build`, `npm audit` (0); 492 unit and screen
tests; 264 quick browser tests (dev and preview); scenarios, including a new persistence scenario,
9 passed in two consecutive runs.

**Not done / blocked on the wallet**: the wallet's own key and note storage; the Receive screen shows
an address only when a wallet provides one (it says so otherwise); camera scanning is tested with a
fake camera only.

## Guardian invitations and a language switch (2026-10-22): done

**Built**

- **Guardian invitation.** In the guardian setup, "Invite a guardian" makes a link to `/invite` that
  holds only the owner's optional name (nothing about the letter, heir or money), in the URL
  fragment so no server sees it. The guardian opens it, reads what the role means in plain words
  (holds one piece of a key, cannot read the letter, must open Zealed now and then), is warned that
  anyone can make an invitation, and gets a reply link carrying their own address (from the Receive
  wallet interface, with a "fresh address" button and a QR code). The owner pastes the reply into a
  guardian field, which fills in the address, or opens it to save the guardian as a contact. The name
  in an invitation is untrusted: it is length- and character-checked and shown as plain text.
- **Language switch.** English, Spanish and French, chosen in Settings or following the browser, with
  English as the fallback. The choice is a plain setting (so storage now holds five non-sensitive
  settings), sets `<html lang>`, and each language is named in its own language. A test checks that
  every language has exactly the same keys and `{placeholders}` as English, so nothing can be missing.

**Covered by translation:** the header and navigation, home page, Settings page, lock screen,
"nothing is saved" notice, Receive, Contacts, Add contact and the invitation pages.

**Not translated yet (be honest about it):** the Legacy, Blind Pot and Unsigned screens and their
forms, the vault/seed/endpoint/wipe sections inside Settings, validation messages that come from the
logic layer (for example "Give this contact a name."), dates and numbers. Settings says that some
screens are still only in English. Feature names (Legacy, Blind Pot, Unsigned) are kept in every
language on purpose. The Spanish and French were written for this prototype and **need review by a
native speaker** before anyone relies on them.

**Verified**: see the run recorded in the commit; new tests cover the invitation format and its
refusals, both pages, the language catalogues and switching, 360 px width and axe in Spanish and
French (light and dark), and a two-actor scenario for the full invite-and-reply flow.

## Real wallet (2026-10-24): sync works on the NU7 testnet; sending is built but not yet proven

**Built**

- `wallet/`: the browser wallet, vendored from WebZjs with changes (NU7, memo send, memo receive,
  Ironwood balance and change, no `eval`). Built to WebAssembly by `npm run wallet:build` and served
  from `public/wallet` (about 60 MB because it holds the proving parameters). See `wallet/README.md`.
- `src/wallet/`: `RealWallet`, one object satisfying every wallet interface the screens use (Blind Pot
  host and guest, Legacy, Unsigned, Dashboard, Receive, seed export); a runtime that opens it when the
  vault is unlocked and keeps it in sync; and the vault record `wallet.v1` (seed, accounts, database).
  The seed and database are encrypted in the vault like the rest; locking closes the wallet.
- A **Wallet** page: create (24 words shown once, confirmed) or restore (optional start block), balance,
  sync status with technical details on failure, and a pointer to get test money.
- Pots are accounts of the same seed; a gift wallet is an account from its own throwaway seed.
- CSP: `worker-src` gained `blob:`; `script-src` is unchanged (no `eval`, no `blob:`).

**Verified**: 23 unit tests of `RealWallet` against a fake wallet; in Chromium, a new wallet is created,
opens, syncs the live NU7 testnet and shows its address (`LIVE_TESTNET=1`, about 7 s). Lint, format,
typecheck, build, 566 unit tests, 320 quick browser tests and 10 scenarios pass.

**Update, same day: real payments work.** After a real payment exposed that the wallet database
could not store Ironwood notes, the wallet was moved to the Ironwood-capable database
(zcash/zcash_client_memory#17) on the released 0.24.0 stack. Receiving, sending two memos in one
transaction, and zero-value memo outputs are now verified on the NU7 testnet, natively and through
the app in Chromium. Transactions and details: `wallet/README.md`, "Evidence".

**Still not exercised on the real chain**: the feature screens themselves (Legacy, Blind Pot, Unsigned)
end to end with the real wallet; gift sweeps; pot withdrawals. Everything that sends (Legacy, Blind Pot gifts, Unsigned) therefore remains
unproven against a real node, and zero-value outputs are the likeliest thing to need a fix. A
funded wallet closes this: `PROBE_DIR=... SEND=1` runs `examples/probe.rs` natively.

**Known limits**: the first load downloads about 55 MB; a restore with no known start block scans from
the start of NU7 (about 70,000 blocks); no host with a 25 MB per-file limit (for example Cloudflare
Pages) can serve the WebAssembly file as it is; syncing and proving use several worker threads, which
needs cross-origin isolation (already set); block times are looked up per block from the server, which
tells it which blocks hold the wallet's notes (it already sees every block fetched); the wallet is
not translated beyond the Wallet page.
