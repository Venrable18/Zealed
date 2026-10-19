import { fixtureClient, FIXTURE_ROUNDS } from '../../crypto/testClient.ts'
import { timeOfRound } from '../../crypto/tlock.ts'
import { FakeWallet as FakePotWallet } from '../blindpot/fakeWallet.ts'
import { buildHostView } from '../blindpot/hostView.ts'
import { createPot } from '../blindpot/service.ts'
import type { HostView, Pot } from '../blindpot/types.ts'
import { FakeLegacyWallet, FakeNetwork } from '../legacy/fakeWallet.ts'
import { findSealedLetters } from '../legacy/inbox.ts'
import { sealAndSend } from '../legacy/seal.ts'
import { ingestForGuardian, releaseAction, type GuardianRecord } from '../legacy/silent/guardian.ts'
import { ingestForHeir, type HeirItem } from '../legacy/silent/heir.ts'
import { ownerCheckIn, setupSilentLetter, type OwnerRecord } from '../legacy/silent/owner.ts'
import type { InboxItem, SentItem } from '../legacy/types.ts'
import type { Card } from '../unsigned/card.ts'
import { createCard } from '../unsigned/service.ts'
import { FakeUnsignedWallet } from '../unsigned/fakeWallet.ts'
import { readInbox, type UnsignedMessage } from '../unsigned/inbox.ts'
import { sendMessage, type SentMessage } from '../unsigned/send.ts'
import type { ReceivedTx } from '../unsigned/walletPort.ts'
import type { DashboardInput } from './stats.ts'

/**
 * TEST SUPPORT. Replays the earlier phases' scenarios with the real logic and test-double wallets
 * and returns the data they leave on the device, so the dashboard can be checked against numbers
 * worked out by hand. Never imported by app code.
 */
export const DEFAULT_NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const ZEC = 100_000_000n
const addr = (name: string) => `utest1${name.padEnd(30, 'x')}`
const [OWNER, G1, G2, G3, HEIR] = [
  'owner',
  'guardianone',
  'guardiantwo',
  'guardianthree',
  'heir',
].map(addr) as [string, string, string, string, string]

async function blindPots(
  NOW: number,
): Promise<{ pots: Pot[]; potViews: Record<string, HostView>; wallet: FakePotWallet }> {
  const wallet = new FakePotWallet()
  // Created 4 h 55 m ago, so the last hourly batch boundary was at 4 h and "now" is 55 minutes into the next batch.
  const options = { nowMs: NOW - (4 * HOUR + 55 * MINUTE), batchIntervalMs: HOUR }
  const made = await createPot(
    wallet,
    { name: 'Ada and Tunde', cover: '🎁', eventDate: '2099-01-01', endDate: '2099-02-01' },
    options,
  )
  const closedMade = await createPot(
    wallet,
    { name: 'Old pot', cover: '', eventDate: '2099-01-01', endDate: '2099-02-01' },
    options,
  )
  if (!made.ok || !closedMade.ok) throw new Error('pots failed')
  const pot: Pot = { ...made.pot, id: 'a'.repeat(32), accountId: 'acct-a' }
  const closed: Pot = { ...closedMade.pot, id: 'b'.repeat(32), accountId: 'acct-b', closed: true }
  // Gifts at 1h10m and 2h20m after creation count; one at 4h50m is after the last boundary (4h) so it is not shown yet.
  const at = (m: number) => pot.createdAtMs + m * MINUTE
  const gifts = new FakePotWallet()
  gifts.payments.push(
    { atMs: at(70), zat: ZEC / 10n },
    { atMs: at(140), zat: ZEC / 2n },
    { atMs: at(290), zat: 5n * ZEC },
  )
  const view = await buildHostView(gifts, pot, NOW)
  const closedView = await buildHostView(new FakePotWallet(), closed, NOW)
  return {
    pots: [pot, closed],
    potViews: { [pot.id]: view, [closed.id]: closedView },
    wallet: gifts,
  }
}

async function legacyModeA(NOW: number): Promise<{ sent: SentItem[]; inbox: InboxItem[] }> {
  const R1 = FIXTURE_ROUNDS[0] ?? 0
  const past = timeOfRound(R1)
  const wallet = new FakeLegacyWallet()
  const ok = await sealAndSend(
    wallet,
    { recipient: HEIR, letter: 'for later', amountZat: ZEC, unlockMs: past },
    { nowMs: past - 30_000, client: fixtureClient() },
  )
  if (!ok.ok) throw new Error('seal failed')
  const failing = new FakeLegacyWallet()
  failing.failNext = 'send'
  const bad = await sealAndSend(
    failing,
    { recipient: HEIR, letter: 'stuck', amountZat: null, unlockMs: past },
    { nowMs: past - 30_000, client: fixtureClient() },
  )
  if (bad.ok || bad.reason !== 'delivery-failed') throw new Error('expected a delivery failure')

  const [ready] = await findSealedLetters(wallet.delivered, NOW)
  if (ready === undefined) throw new Error('expected a letter')
  // One letter whose time has come and one still locked for a day.
  return {
    sent: [ok.item, bad.item],
    inbox: [ready, { ...ready, bundleIdHex: 'locked', unlockMs: NOW + 24 * HOUR }],
  }
}

async function legacyModeB(NOW: number): Promise<{
  owned: OwnerRecord[]
  guardians: GuardianRecord[]
  heirs: HeirItem[]
}> {
  const network = new FakeNetwork()
  const w = (address: string) => new FakeLegacyWallet({ address, network })
  const [owner, g1, g2, g3, heir] = [w(OWNER), w(G1), w(G2), w(G3), w(HEIR)] as const
  const P = 2 * MINUTE
  const G = MINUTE
  const base = {
    heirAddress: HEIR,
    guardianAddresses: [G1, G2, G3],
    threshold: 2,
    periodMs: P,
    graceMs: G,
    letter: 'if I go silent',
    amountZat: null,
  }
  // A: owner checked in once and then went silent long ago (guardians are releasing).
  const a = await setupSilentLetter(owner, base, { nowMs: NOW - 10 * MINUTE })
  // B: owner is checking in and is fine.
  const b = await setupSilentLetter(
    owner,
    { ...base, letter: 'still here' },
    { nowMs: NOW - 30_000 },
  )
  if (!a.ok || !b.ok) throw new Error('setup failed')
  const bChecked = await ownerCheckIn(owner, b.record, NOW - 10_000)

  let guardians: GuardianRecord[] = []
  guardians = (await ingestForGuardian(guardians, await g1.receivedMemos(), NOW)).records
  // Guardians two and three release letter A to the heir.
  for (const wallet of [g2, g3]) {
    const { records } = await ingestForGuardian([], await wallet.receivedMemos(), NOW)
    const releasing = records.find((r) => r.bundleIdHex === a.record.bundleIdHex)
    const action = releasing === undefined ? null : releaseAction(releasing, NOW)
    if (action !== null) await wallet.sendMemos(action)
  }
  const heirs = await ingestForHeir([], await heir.receivedMemos(), NOW)
  return { owned: [a.record, bChecked.record], guardians, heirs }
}

async function unsigned(NOW: number): Promise<{
  card: Card
  messages: UnsignedMessage[]
  sentMessages: SentMessage[]
}> {
  const network = new Map<string, ReceivedTx[]>()
  const recipient = new FakeUnsignedWallet(network)
  const made = await createCard(recipient, {
    name: 'Ada — tips',
    bio: '',
    minimumZat: 5_000_000n,
    acceptsReplies: true,
  })
  if (!made.ok) throw new Error('card failed')
  const card = made.card
  recipient.receive(card.address, {
    txid: 't1',
    receivedAtMs: NOW - 3000,
    amountZat: 2n * ZEC,
    messages: ['paid in full'],
  })
  recipient.receive(card.address, {
    txid: 't2',
    receivedAtMs: NOW - 2000,
    amountZat: 5_000_000n,
    messages: ['paid the minimum'],
  })
  recipient.receive(card.address, {
    txid: 't3',
    receivedAtMs: NOW - 1000,
    amountZat: 1_000_000n,
    messages: ['paid too little'],
  })

  // This person also sent one message to someone else.
  const sender = new FakeUnsignedWallet(network)
  const other = await createCard(new FakeUnsignedWallet(network), {
    name: 'Bo',
    bio: '',
    minimumZat: 5_000_000n,
    acceptsReplies: false,
  })
  if (!other.ok) throw new Error('card failed')
  const sent = await sendMessage(
    sender,
    other.card,
    { body: 'a tip', amountZat: 5_000_000n, allowReplies: false, keepReceipt: false },
    { nowMs: NOW },
  )
  if (!sent.ok) throw new Error('send failed')
  return {
    card,
    messages: await readInbox(await recipient.receivedTransactions(card.address), card),
    sentMessages: [sent.sent],
  }
}

/** The data left on a device after all of the earlier scenarios, with the clock at `NOW`. */
export async function fullScenario(
  NOW = DEFAULT_NOW,
): Promise<DashboardInput & { potWallet: FakePotWallet }> {
  const [pots, a, b, u] = await Promise.all([
    blindPots(NOW),
    legacyModeA(NOW),
    legacyModeB(NOW),
    unsigned(NOW),
  ])
  return {
    potWallet: pots.wallet,
    nowMs: NOW,
    balance: { spendableZat: 3n * ZEC + 25_000_000n, pendingZat: 10_000_000n },
    pots: pots.pots,
    potViews: pots.potViews,
    legacySent: a.sent,
    legacyInbox: a.inbox,
    owned: b.owned,
    guardians: b.guardians,
    heirs: b.heirs,
    card: u.card,
    messages: u.messages,
    sentMessages: u.sentMessages,
  }
}
