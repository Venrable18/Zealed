# Privacy checklist

Reviewed in Phase 14 (2026-10-19). Each item says what was checked, how, and whether it holds
today. **Met** means verified by an automated check that runs in CI. **Partly** and **Not met** say
exactly what is missing and why.

## Summary

| #   | Item                                                         | Status                                                                                        |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1   | No secrets in logs                                           | Met                                                                                           |
| 2   | Local storage is encrypted                                   | **Met, with caveats**: opt-in passphrase vault; the wallet's own storage is pending (Phase 3) |
| 3   | No network calls outside the allowlist                       | Met                                                                                           |
| 4   | No referrer leaks                                            | Met                                                                                           |
| 5   | Card and pot data only in URL fragments                      | Met                                                                                           |
| 6   | No analytics, telemetry or third-party code                  | Met                                                                                           |
| 7   | Untrusted text is shown as text                              | Met                                                                                           |
| 8   | The dashboard makes no network requests                      | Met                                                                                           |
| 9   | Only well-known audited crypto, nothing home-made            | Met                                                                                           |
| 10  | Malformed or hostile input is ignored safely                 | Met                                                                                           |
| 11  | Wallet seed and keys are never logged or stored in the clear | **Partly**: the seed screen is built and tested; the wallet itself is pending                 |
| 12  | No known vulnerable dependencies                             | Met (`npm audit`: 0)                                                                          |

## Details

### 1. No secrets in logs: Met

- The lint rule `no-console: error` forbids any logging in app code (`eslint.config.js`).
- Every multi-actor scenario records **every** console message of **every** browser context and fails
  if there is even one (`assertClean` in `tests/e2e/scenarios/support.ts`), not only errors.
- Error values are fixed phrases with no content: `CryptoError` carries a code only; wallet failures
  are reported as "could not" messages without details.

### 2. Local storage is encrypted: Met, with caveats

- **Nothing private is written unless the person chooses a passphrase** (Settings). Without one,
  pots, letters, shares, check-in keys, messages, contacts and the sent list live in memory only,
  and the app says so. Scenarios assert a browser then holds only the five non-sensitive settings,
  no cookies, no session data and no IndexedDB database.
- With a passphrase, a key is derived with PBKDF2-SHA256 (600,000 rounds, random salt) and kept
  only in memory as a non-extractable AES-256-GCM key. Every stored record is encrypted with its
  name as authenticated data, so a record cannot be swapped for another. Only the `zealed-vault`
  IndexedDB database is created. Tests read the raw database and fail if any name, address or
  message text is readable (`src/storage/*.test.ts`, `tests/e2e/vault.spec.ts`,
  `tests/e2e/scenarios/persistence.spec.ts`).
- Locking (button, auto-lock timer, or reload) wipes the in-memory private data and shows a lock
  screen. Five wrong passphrases trigger a 30-second wait in the app.
- Caveats: the passphrase cannot be recovered (by design); an attacker who copies the database can
  guess offline, limited only by the 600,000-round cost, so a long passphrase matters (minimum 10
  characters is enforced); a compromised device or browser extension can read memory while the app
  is unlocked; and the **wallet's own storage (keys, notes) does not exist yet** and will need the
  same test when the wallet is added.

### 3. No network calls outside the allowlist: Met

- The Content Security Policy's `connect-src` is generated from `src/config/network.ts` and is
  `'self'` plus the configured light-wallet server and drand. A browser test proves a request to any
  other host is blocked.
- Every scenario asserts that every request from every actor went to the app's own origin, or, for
  Legacy Mode A only, to drand.
- The dashboard is checked separately (item 8).

### 4. No referrer leaks: Met

- `Referrer-Policy: no-referrer` is sent with every response (tested), the page has
  `<meta name="referrer" content="no-referrer">`, and the server health check also sets
  `referrerPolicy: 'no-referrer'` and `credentials: 'omit'`.
- Every scenario records the `Referer` header of any request to another origin and fails if one was
  sent. (For the real drand run this is checked against the real network.)

### 5. Card and pot data only in URL fragments: Met

- Blind Pot links (`/blind-pot/give#pot=...`) and contact cards (`/u#...`) keep everything after `#`,
  which browsers never send. Unit tests check the format and that decoders reject hostile input.
- Scenarios assert that no request URL from any actor contains an address or a pot payload.

### 6. No analytics, telemetry or third-party code: Met

`default-src 'none'` with only `'self'` for scripts, styles, fonts and images. Fonts are bundled.
All scenarios and the browser tests assert nothing is requested from any other origin.

### 7. Untrusted text is shown as text: Met

Names, bios, letters, wishes and messages are rendered as React text and never as markup. Tests feed
`<img onerror=...>` and `<script>` through the card, pot, letter, wish and message screens and check
no element is created. Control and bidirectional-override characters are rejected on input.

### 8. The dashboard makes no network requests: Met

A source scan fails on any network API or network-bound import in the dashboard code, and a browser
test shows that opening it fetches only its own code files, and that refreshing and waiting produce
no requests at all.

### 9. Only well-known audited crypto: Met

AES-256-GCM through WebCrypto; Ed25519 from `@noble/curves`; Shamir from the audited
`shamir-secret-sharing`; timelock from `tlock-js` against drand quicknet; SHA-256 through WebCrypto.
No primitive is implemented in Zealed. Keys and salts come from `crypto.getRandomValues`.

### 10. Malformed or hostile input is ignored safely: Met

Every decoder (ZMP chunks, bundles, policies, share and release messages, card and pot links, cards,
messages, receipts, light-wallet replies) returns "not valid" instead of throwing, and is fuzzed with
seeded random and damaged input. The scenarios inject random bytes, text memos and malformed memos
into every actor's inbox and check the apps ignore them with no errors.

### 11. Wallet seed and keys are never logged or stored in the clear: Partly

Built and tested: the seed screen needs the passphrase again, never offers copy, hides after a
minute, clears on close and pauses after five wrong tries; the check-in private key and shares are
only ever held in memory. Not built: the wallet that holds the seed (Phase 3).

### 12. No known vulnerable dependencies: Met

`npm audit --omit=dev` reports 0 vulnerabilities. Run in the checks for every phase.

## Not covered (out of scope or not testable here)

- A compromised browser, operating system or extension; a malicious deployed build.
- Network-level traffic analysis (timing and size of requests to the light-wallet server).
- Real Zcash behaviour: all multi-actor scenarios use a simulated chain (see `PROGRESS.md`).
