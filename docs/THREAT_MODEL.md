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

The Phase 14 review below summarises every feature; full review in
Phase 14. Legacy Mode B is below.

### Legacy Mode B: open if I go silent (Phase 10)

**Design.** The letter is encrypted with a fresh AES-256-GCM key and delivered to the heir. The
key is split with Shamir into `n` shares (2 to 5, threshold `t`), one per guardian. Guardians
also get a policy (heir address, periods, a commitment to the key, the owner's Ed25519 check-in
public key) and a first check-in. The owner proves they are alive with signed check-ins. After
the check-in period plus the grace period without one, each guardian's app sends its share to the
heir; with `t` shares the heir rebuilds the key and opens the letter.

**What each party can and cannot do**

| Party                    | Holds                    | Can                                          | Cannot                                                     |
| ------------------------ | ------------------------ | -------------------------------------------- | ---------------------------------------------------------- |
| Heir, alone              | The encrypted letter     | See that a letter exists                     | Read it, or learn anything about the key                   |
| One guardian             | One share, the policy    | Remind the owner, release early (see limits) | Read the letter; open it alone                             |
| Fewer than `t` guardians | Their shares             | Nothing useful                               | Rebuild the key (the math gives no information below `t`)  |
| Heir plus `t` guardians  | Letter and enough shares | Open the letter at any time                  | (This is the collusion limit below)                        |
| Outsider                 | Nothing                  | Send junk memos to anyone                    | Forge a check-in or revoke (needs the owner's private key) |
| Chain observer           | Encrypted shielded memos | See that transactions happened               | Read memos, amounts or who sent them                       |

**Controls and where they are tested**

- Check-ins and revokes are signed (Ed25519, separate domain tags), carry a counter that must
  always rise, and a timestamp that may not be in the future. Forged, replayed, old-counter,
  wrong-bundle and future-dated check-ins are rejected; a rejected one changes nothing.
  (`src/crypto/crypto.test.ts`, `src/features/legacy/silent/silent.test.ts`.)
- A revoke makes guardians erase their shares; a forged revoke is ignored; a late check-in does
  not undo a revoke.
- Shares are wrapped with their threshold and total, so too few shares is an explicit error. The
  heir checks the rebuilt key against a commitment, and tries every group of `t` shares, so a
  bogus share sent by an outsider cannot block the letter while enough real shares exist.
- A guardian's share is erased from the device after it is released or revoked.
- The ciphertext header is authenticated, so a letter cannot be moved into another bundle.

**Known limitations (also stated in the app)**

1. **Collusion.** The heir and `t` guardians together can open the letter at any time. Choose
   guardians who will not act together, and a threshold that fits.
2. **Guardians act only when they open Zealed.** Browsers cannot run it in the background. If too
   few guardians open the app, release is late, not lost: it happens the next time they open it.
   With fewer than `t` guardians available, the heir can never open the letter. The owner should
   pick guardians who will open the app and a threshold that leaves room for some being offline.
3. **Release cannot be undone.** Once a guardian sends a share it is with the heir. A later
   check-in or revoke cannot recall it. Revoke before release if the owner is alive.
4. **The owner's check-in key.** It lives only on the owner's device. If it is lost the owner
   cannot check in or revoke; guardians will eventually release. Back up the wallet seed and
   store the key only in encrypted storage (Phase 3). The key must never be logged or sent.
5. **Clocks.** Deadlines use the owner's signed check-in time (never later than the guardian's
   own clock, and rejected if more than 10 minutes ahead) and each guardian's own clock. A wrong
   clock on the owner's device makes check-ins look older or newer; a wrong clock on a guardian's
   device makes their release early or late.
6. **Metadata.** Guardians learn the heir's address and the owner's address (needed to send
   reminders and releases), and that a letter exists. Guardians and the heir see the check-in
   schedule. Zcash hides senders, so a reminder to the owner does not reveal who sent it.
7. **Unauthenticated inbound messages.** Anyone with an address can send it a memo. Junk shares,
   check-ins or reminders are rejected or counted but never act on their own; the worst effect of
   junk is noise.
8. **Sent items hold secrets.** The owner record contains the check-in private key; guardian
   records contain key shares; the heir's list contains shares. They are in memory only until
   encrypted storage exists, and must never go to plaintext storage.
9. **The gift.** A gift is held by a throwaway wallet whose seed is inside the letter, so it
   follows the same rules as the letter. The owner cannot reclaim it after delivery.

### Unsigned: recipient side (Phase 11)

**Design.** The recipient makes a contact card (name, bio, minimum payment, replies on or off) with
its own receiving address. The card is shared as a link with the data in the URL fragment, so no
server sees it. Senders pay with a message in the memos; the inbox reassembles messages and
filters by what was paid.

**Controls**

- **Spam is priced out.** Each message must pay the minimum (never below 0.001 ZEC); less goes to
  a hidden folder. **Each payment pays for one message**: if a payment carries several, only the
  first counts as paid, so one minimum payment cannot carry a batch past the filter.
- **No sender identity is ever available.** The wallet returns amount, block time and memos
  only. The app has no sender field to show.
- **Untrusted text is rendered as text**, never markup. Names, bios and messages reject control and
  bidirectional-override characters; messages are capped at 2,048 bytes.
- Cards and messages are decoded strictly; malformed or hostile links, memos and payloads are
  ignored, never throw, and are fuzz-tested.

**Known limitations**

1. **A card link cannot be turned off.** Anyone with it can pay to its address. "Replace card"
   starts a new address; the old one still receives, and the app says so.
2. **The minimum is a convention, not a rule.** Senders can still send underpaid messages; the
   recipient just never sees them unless they open the hidden folder. They still cost the sender
   a fee, but not the minimum.
3. **A reply reveals the recipient's reply timing** to whoever holds the sender's reply address
   (the sender), and the sender chooses that address, so a careless sender could give an address
   linked to themselves. Zealed cannot prevent that; the sender screen (Phase 12) warns.
4. **Earnings count only payments that carried a Zealed message.** Plain payments to the card
   address are not counted.
5. **Everything is in memory** until encrypted storage exists (Phase 3): messages and the card
   vanish on reload.
6. **Payments are linkable by amount and time** to anyone who can see both sides; shielded
   transactions hide this on chain, but a sender and recipient who compare notes can match them.

### Unsigned: sender side (Phase 12)

**Design.** A sender opens a card link (the card is in the URL fragment), writes a message of up to
2 KB, pays at least the card's minimum, and the message travels as memos in the same single
transaction as the payment. They may ask for a reply (a fresh address is made for it) and may keep
a receipt (a commitment in the memo).

**Controls**

- Nothing is sent unless every check passes: message valid, payment at least the minimum (a smaller
  payment would never be read, so it is refused up front), enough spendable money for the payment
  and fee. A failed send says plainly that nothing was paid.
- The reply address is **always a fresh address from the wallet**, never the wallet's main address,
  and a different one for every message, so a recipient cannot link two of one sender's messages
  through it. A card that turns replies off never gets one, even if the sender asked.
- The message text is kept on the device only when a receipt was requested (it is needed to reveal
  it later). Otherwise only the amount and time are kept.
- A visible privacy panel is shown before writing: use a separate wallet, avoid identifying details,
  consider Tor Browser (and that this app needs JavaScript, so Tor Browser's "Safest" level will not
  work), amounts and timing can be matched, and a reply address links one sender's messages.

**Optional receipt.** The memo carries `SHA-256(salt || message)` with a random 16-byte salt kept by
the sender. The commitment **hides** the message (the salt is secret and random) and **binds** the
sender to it (it cannot be changed later). The receipt file holds the transaction id, salt,
commitment, time and card address, and **no message text**; the sender keeps the message
separately. To prove what they sent, the sender reveals message and salt; the recipient's verify
screen recomputes the commitment and looks for it among the messages received. Checked values are
compared in constant time, and surrounding whitespace is ignored the same way as when sending.

**Known limitations**

1. **Zealed cannot hide who you are from your own device or network**, or from how you write. The
   chain hides the payer; the message content and your connection can still identify you.
2. **A receipt proves what a sender sent, not who they are**, and only to someone who has the salt.
   A sender who loses the salt or the message cannot prove anything.
3. **A recipient can claim not to have received a message.** The receipt shows a transaction on the
   chain, which anyone can check, but cannot show the recipient read it.
4. **A reply address links one sender's replies.** It is fresh per message, but whoever reads the
   replies knows they came from the same sender.
5. **Payment amount and time are linkable** by someone who can see both ends, for example if the
   sender tells a third party what they paid and when.
6. **The sent list and any kept message text are in memory only** until encrypted storage exists
   (Phase 3), and must never go to plaintext storage.
7. **The receipt download** uses the browser's own save. It has been checked with a stand-in in
   tests and not yet in a real browser download under the page's security policy.

### Dashboard and settings (Phase 13)

**Dashboard.** Every number is computed on the device from data already there: the app's own stores,
the wallet's local balance, and pot totals **as of each pot's last batch boundary** (never per
payment). It makes no network requests: a test scans its source for network APIs and network-bound
imports, and a browser test checks the running page (only its own code files are downloaded, nothing
else, no POST, no light-wallet server, no drand). It reveals nothing a screen elsewhere did not, and
has no per-payment, per-gift, per-message or per-address field.

**Settings**

- **Server choice.** Only servers listed in the app's configuration can be chosen: the page's CSP
  blocks every other address, and saved values are checked on load, so edited browser storage cannot
  point the app at an unlisted server. The health check runs only when pressed, sends an empty
  request (no identifier, no referrer, no cookies) and reports reachability, network (a mainnet
  server is refused) and the network upgrade. The server operator sees the connection, as with any
  sync.
- **Seed export.** Needs the passphrase again, checked by the wallet. The words are never put on the
  clipboard or in storage, disappear after a minute or on "Hide now", and are cleared when the
  screen closes. Five wrong passphrases pause attempts for 30 seconds (this slows guessing on a
  device someone else is holding; it is not a substitute for a strong passphrase).
- **Auto-lock.** 1 to 60 minutes, and deliberately no "never".
- **Wipe local data.** Needs the exact word typed. Removes settings, session data and every
  IndexedDB database, empties every in-memory store, then returns to the start. Without the seed
  phrase, wallet funds cannot be recovered afterwards. A browser that cannot list its databases is
  reported, and the person is told to clear site data in the browser settings to be sure.

**Known limitations**

1. The wipe cannot reach a copy the person made elsewhere (a screenshot, a downloaded receipt).
2. The seed screen cannot stop a screen recorder, shoulder-surfing or a malicious extension.
3. Auto-lock and seed export are settings and screens only until the wallet exists (Phase 3).
4. The attempt limit is held in the page, so reloading resets it; the wallet's own passphrase hashing
   (Phase 3) is the real defence against guessing.

### Blind Pot (Phases 6 and 7)

**Design.** The host makes a pot with its own receiving address and shares a link (data in the URL
fragment). A guest's gift is split into standard 1-2-5 pieces (at most 6), each sent as its own
transaction, one at a time with a random extra delay, in shuffled order. A wish rides with a 0.001
piece. The host sees only a total as of the last batch boundary (hourly; 60 seconds in demo mode),
a privacy-strength band and shuffled wishes. Guests who pay from another wallet use a ZIP 321 request
and are warned it gives weaker privacy.

**Controls**

- The wallet interface the host screens use returns aggregates and bare memos only (no per-payment
  field), and the dashboard adds none. The host screen is checked by a browser scenario with three
  guests: it shows only the batched total and the wish, and none of the single gift amounts.
- The total is read **as of the last batch boundary**, so it is the same however often the host looks
  and a gift that arrives later is not visible until the next boundary.
- Each piece is its own transaction in a standard size, spread out in time; the scenario checks nine
  separate transactions, all standard sizes, spread over several seconds, with the wish on exactly
  one 0.001 piece.
- Wishes are validated (140 characters, one memo, no control characters), shuffled per batch and shown
  with no time or amount.

**Known limitations**

1. **The host's wallet can see every incoming note.** Standard sizes, timing and batching make single
   gifts hard to pick out; they cannot hide them from someone who reads the wallet itself.
2. **Few gifts means weak privacy.** With fewer than about six pieces one guest could account for the
   whole total. The strength band says so.
3. **A contributor must keep the page open** while pieces go out. The queue is in memory until
   encrypted storage exists, so closing it stops the gift (pieces already sent are kept).
4. **A guest who pays from another wallet is not split** and can be told apart.
5. **A gift is rounded to standard sizes**, shown to the guest before sending; with a wish it may go
   up by 0.001 ZEC.
6. **Timing across guests can correlate** if one person sends many gifts from several wallets at once.

## Phase 14 review: what each feature protects, and its limits

| Feature                       | Protects against                                                                                           | Does not protect against                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Blind Pot**                 | The host learning who gave what or how much; an observer linking a guest's pieces.                         | A host reading the wallet directly; very few gifts; a guest paying from another wallet.                                              |
| **Legacy A** (open on a date) | Anyone, including the sender and the recipient, opening the letter early; a server reading it.             | The recipient losing the letter; drand being unreachable (it waits, it does not fail); the sender reclaiming the gift.               |
| **Legacy B** (if I go silent) | Early opening by the heir alone or by fewer than the threshold of guardians; forged check-ins and revokes. | The heir plus enough guardians colluding; guardians who never open the app; the owner losing the check-in key; release being undone. |
| **Unsigned**                  | The recipient learning who sent a message; spam (priced out); forged receipts.                             | Content that identifies the sender; a sender's own device or network; a recipient denying receipt.                                   |
| **Dashboard and settings**    | Any network leak from the dashboard; tampered saved settings; an unlisted server.                          | Someone with the unlocked device; a screenshot or recorder.                                                                          |

**What the multi-actor scenarios proved** (simulated chain, real screens and real crypto, run in real
time in separate browser contexts): Blind Pot with a host and three guests; Legacy A (offline, and
against the real drand network); Legacy B with an owner, three guardians (one offline), a heir, a
forged check-in and a forged revoke; Unsigned with a recipient and a sender; and the error paths
(not enough money, running out partway, change not yet spendable, drand unreachable, junk memos).
**What they did not prove:** anything about the real wallet, real transactions, real block times or
real fees. Those need the WebZjs tooling and the wallet (Phase 3).
