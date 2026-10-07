# Threat model

Living document. Phase 1 covers the platform baseline; feature sections are completed in
Phases 10 and 14.

## What we protect

- Wallet secrets: seed phrase, spending keys, viewing keys.
- Who paid whom and how much (Blind Pot contributors, Unsigned senders).
- Letter and message contents, before they are meant to be read (Legacy, Unsigned).
- Local data: pots, sealed items, guardian shares, inbox, dashboard stats.

## Who we defend against

| Adversary                                        | Can                                                  | Should not learn                                                               |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Hosting server / CDN                             | Serve the app, see request paths and IPs             | Card or pot data (kept in the URL fragment), anything the user does in the app |
| Light-wallet endpoint operator                   | See the IP and timing of sync and broadcast requests | Amounts, memo contents, recipients (shielded)                                  |
| Chain observer                                   | See every transaction on the public chain            | Sender, recipient, amount, memo (shielded)                                     |
| Pot host                                         | See every note arriving in the pot account           | Which guest gave which amount                                                  |
| Third-party scripts, analytics, fonts            | —                                                    | Anything: none are loaded                                                      |
| Someone with brief access to the unlocked device | Use the app                                          | Covered by auto-lock (Phase 3)                                                 |

Out of scope: a compromised browser, OS or extension with page access; a malicious build
served by the host (users must trust the deployed code); network-level traffic analysis
beyond what Zcash and Tor already address.

## Platform controls (Phase 1)

- **No backend.** The only network destinations are the light-wallet endpoints and drand in
  `src/config/network.ts`.
- **Content Security Policy** generated from `network.ts` and sent by the dev server,
  `vite preview` and the deployed `_headers`: `default-src 'none'`, scripts/styles/fonts
  only from the app's own origin, `connect-src` limited to the allowlist, no framing
  (`frame-ancestors 'none'`), no plugins, `base-uri`/`form-action` locked. Production has
  no inline code; the dev server uses a per-run nonce instead of `'unsafe-inline'`.
- **Cross-origin isolation** (COOP/COEP), required for multithreaded WASM. It also keeps
  other origins from holding a reference to the app's window.
- **`Referrer-Policy: no-referrer`** (header and `<meta>`), so links out of the app do not
  leak the page URL.
- **No logging in app code**: ESLint `no-console: error` outside tests and tooling.
- **Local preferences only**: localStorage holds the demo-mode flag and nothing else.
  Wallet data goes in encrypted IndexedDB (Phase 3).

## Known limitations

- Guardians' apps act only when opened; browsers cannot run Zealed in the background
  (Legacy Mode B, Phase 10).
- Early opening of a Mode B letter is possible if the heir and `t` guardians collude.
- Clearing browser data deletes the local wallet; the seed backup is the only recovery path.
- External-wallet contributions to a Blind Pot (single ZIP-321 payment) are not split and
  give weaker privacy.

## Feature analysis

To be completed: Blind Pot (Phases 6–7), Legacy (Phases 8–10), Unsigned (Phases 11–12),
full review in Phase 14.
