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
