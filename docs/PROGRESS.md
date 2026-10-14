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
