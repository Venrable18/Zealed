// @vitest-environment jsdom
import '../../test/nodeGlobals.ts'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ToastViewport } from '../../components/Toasts.tsx'
import { FIXTURE_ROUNDS, fixtureClient } from '../../crypto/testClient.ts'
import { timeOfRound } from '../../crypto/tlock.ts'
import { ComposeLetter } from './ComposeLetter.tsx'
import { FakeLegacyWallet } from './fakeWallet.ts'
import { InboxList } from './InboxList.tsx'
import { findSealedLetters } from './inbox.ts'
import { sealAndSend } from './seal.ts'
import { SentList } from './SentList.tsx'
import { useLegacy } from './stores.ts'
import type { InboxItem, SentItem } from './types.ts'

const R1 = FIXTURE_ROUNDS[0] ?? 0
const UNLOCK_MS = timeOfRound(R1)
const RECIPIENT = 'utest1recipientaddressrecipientaddress'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
  }
})

beforeEach(() => {
  useLegacy.setState({ sent: [], inbox: [] })
})

afterEach(cleanup)

function fillCompose(overrides: { recipient?: string; letter?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/Recipient/), {
    target: { value: overrides.recipient ?? RECIPIENT },
  })
  fireEvent.change(screen.getByLabelText('Your letter'), {
    target: { value: overrides.letter ?? 'See you on the other side.' },
  })
}

describe('ComposeLetter', () => {
  const renderCompose = (wallet: FakeLegacyWallet | null) =>
    render(
      <>
        <ComposeLetter
          wallet={wallet}
          defaultUnlockDelayMs={60_000}
          demoMode={false}
          client={fixtureClient()}
        />
        <ToastViewport />
      </>,
    )

  it('explains each mistake next to its field', () => {
    renderCompose(new FakeLegacyWallet())
    fireEvent.click(screen.getByRole('button', { name: 'Seal and send' }))
    expect(screen.getByText('Enter the recipient’s Zealed address.')).toBeTruthy()
    expect(screen.getByText('Write something to seal.')).toBeTruthy()
  })

  it('counts the letter in bytes and rejects one that is too long', () => {
    renderCompose(new FakeLegacyWallet())
    fillCompose({ letter: 'a'.repeat(2049) })
    expect(screen.getByText(/2049 of 2048 bytes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Seal and send' }))
    expect(screen.getByText(/A letter can be up to 2048 bytes/)).toBeTruthy()
  })

  it('says plainly when there is no wallet and seals nothing', () => {
    renderCompose(null)
    fillCompose()
    fireEvent.click(screen.getByRole('button', { name: 'Seal and send' }))
    expect(screen.getByRole('alert').textContent).toContain('You need a wallet first')
    expect(useLegacy.getState().sent).toHaveLength(0)
  })

  it('shows the fee, asks first, then seals, sends and lists the letter', async () => {
    const wallet = new FakeLegacyWallet()
    wallet.fee = 30_000n
    renderCompose(wallet)
    fillCompose()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include ZEC with the letter' }))
    fireEvent.change(screen.getByLabelText('Gift amount (ZEC)'), { target: { value: '0.25' } })

    expect(await screen.findByText(/Network fee:/, {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.getByText(/Network fee:/).textContent).toContain('0.0003 ZEC')
    expect(screen.getByText(/on top of the 0.25 ZEC gift/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Seal and send' }))
    const dialog = await screen.findByRole('dialog', { name: /^Seal it until/ })
    expect(within(dialog).getByText(/utest1reci…/)).toBeTruthy()
    expect(within(dialog).getByText(/includes 0.25 ZEC/)).toBeTruthy()
    expect(wallet.events).toEqual([])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Seal and send' }))
    expect(
      await screen.findByText('Your letter was sealed and sent.', {}, { timeout: 5000 }),
    ).toBeTruthy()
    expect(wallet.events).toEqual(['gift', 'fund', 'send'])
    expect(useLegacy.getState().sent).toHaveLength(1)
    expect(useLegacy.getState().sent[0]).toMatchObject({
      recipient: RECIPIENT,
      amountZat: 25_000_000n,
      status: 'sent',
    })
  })

  it('says what happened when delivery fails after funding, and keeps the item to retry', async () => {
    const wallet = new FakeLegacyWallet()
    wallet.failNext = 'send'
    renderCompose(wallet)
    fillCompose()
    fireEvent.click(screen.getByRole('button', { name: 'Seal and send' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Seal and send' }))
    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain(
      'Your funds are safe',
    )
    expect(useLegacy.getState().sent[0]?.status).toBe('failed')
  })
})

describe('SentList', () => {
  const failed: SentItem = {
    id: 'a1',
    bundleIdHex: 'a1',
    recipient: RECIPIENT,
    unlockMs: UNLOCK_MS,
    createdAtMs: 1,
    amountZat: 10_000_000n,
    status: 'failed',
    memos: [new Uint8Array(512)],
    giftSeed: 'seed words 1',
  }

  it('is empty at first', () => {
    render(<SentList wallet={null} />)
    expect(screen.getByText('Nothing sealed yet')).toBeTruthy()
  })

  it('shows only "sent", never "opened", and offers a retry for a failed one', async () => {
    const wallet = new FakeLegacyWallet()
    useLegacy.setState({
      sent: [failed, { ...failed, id: 'b2', bundleIdHex: 'b2', status: 'sent' }],
    })
    render(
      <>
        <SentList wallet={wallet} />
        <ToastViewport />
      </>,
    )
    expect(screen.getByText(/cannot tell you whether a letter has been opened/)).toBeTruthy()
    expect(screen.queryByText(/Opened/)).toBeNull()
    expect(screen.getByText('Sent')).toBeTruthy()
    expect(screen.getByText(/Not delivered. Your funds are safe./)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('The letter was delivered.')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    })
    expect(wallet.delivered).toHaveLength(1)
    expect(useLegacy.getState().sent.find((item) => item.id === 'a1')?.giftSeed).toBeUndefined()
  })
})

describe('InboxList', () => {
  async function sealedFor(wallet: FakeLegacyWallet): Promise<InboxItem> {
    const result = await sealAndSend(
      wallet,
      {
        recipient: RECIPIENT,
        letter: 'Dear Ada,\nI hope this finds you well.',
        amountZat: 50_000_000n,
        unlockMs: UNLOCK_MS,
      },
      { nowMs: UNLOCK_MS - 30_000, client: fixtureClient() },
    )
    if (!result.ok) throw new Error('expected success')
    const [item] = await findSealedLetters(wallet.delivered, 1)
    if (item === undefined) throw new Error('expected a letter')
    return item
  }

  it('is empty at first, and checking finds nothing when there are no letters', async () => {
    render(
      <>
        <InboxList wallet={new FakeLegacyWallet()} client={fixtureClient()} />
        <ToastViewport />
      </>,
    )
    expect(screen.getByText('No sealed letters')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check for sealed letters' }))
    expect(await screen.findByText('No sealed letters found.')).toBeTruthy()
  })

  it('finds a letter, opens it once its time has come, and moves the gift into the wallet', async () => {
    const wallet = new FakeLegacyWallet()
    await sealedFor(wallet)
    render(
      <>
        <InboxList wallet={wallet} client={fixtureClient()} />
        <ToastViewport />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check for sealed letters' }))
    expect(await screen.findByText(/Sealed until/)).toBeTruthy()
    expect(screen.getByText('It is time. You can open it now.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open letter' }))
    expect(await screen.findByText(/I hope this finds you well/)).toBeTruthy()
    expect(screen.getByText('This letter came with a gift of ZEC.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Move the gift into my wallet' }))
    expect(await screen.findByText(/Moved 0\.49975 ZEC into your wallet/)).toBeTruthy()
    expect(wallet.swept).toHaveLength(1)
  })

  it('cannot be opened before the unlock time, and shows a countdown', async () => {
    const wallet = new FakeLegacyWallet()
    const item = await sealedFor(wallet)
    useLegacy.setState({ inbox: [{ ...item, unlockMs: Date.now() + 3_600_000 }] })
    render(<InboxList wallet={wallet} client={fixtureClient()} />)
    expect(screen.getByText(/Sealed until/)).toBeTruthy()
    expect(screen.getByText('It cannot be opened before then, by anyone.')).toBeTruthy()
    expect(screen.getByText(/^\d\d:\d\d:\d\d$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open letter' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText(/I hope this finds you well/)).toBeNull()
  })

  it('says so when the drand network cannot be reached, and lets the person try again', async () => {
    const wallet = new FakeLegacyWallet()
    const item = await sealedFor(wallet)
    useLegacy.setState({ inbox: [item] })
    const offline = fixtureClient()
    offline.get = () => Promise.reject(new Error('offline'))
    render(<InboxList wallet={wallet} client={offline} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open letter' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'could not be fetched from the drand network',
    )
    expect(screen.getByRole('button', { name: 'Open letter' }).hasAttribute('disabled')).toBe(false)
  })

  it('treats a letter with no gift as just a letter', async () => {
    const wallet = new FakeLegacyWallet()
    const result = await sealAndSend(
      wallet,
      { recipient: RECIPIENT, letter: 'Just words.', amountZat: null, unlockMs: UNLOCK_MS },
      { nowMs: UNLOCK_MS - 30_000, client: fixtureClient() },
    )
    if (!result.ok) throw new Error('expected success')
    useLegacy.setState({ inbox: await findSealedLetters(wallet.delivered, 1) })
    render(<InboxList wallet={wallet} client={fixtureClient()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open letter' }))
    expect(await screen.findByText('Just words.')).toBeTruthy()
    expect(screen.queryByText(/gift of ZEC/)).toBeNull()
  })

  it('shows a letter as plain text, never as markup', async () => {
    const wallet = new FakeLegacyWallet()
    const result = await sealAndSend(
      wallet,
      {
        recipient: RECIPIENT,
        letter: '<img src=x onerror=alert(1)>',
        amountZat: null,
        unlockMs: UNLOCK_MS,
      },
      { nowMs: UNLOCK_MS - 30_000, client: fixtureClient() },
    )
    if (!result.ok) throw new Error('expected success')
    useLegacy.setState({ inbox: await findSealedLetters(wallet.delivered, 1) })
    const { container } = render(<InboxList wallet={wallet} client={fixtureClient()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open letter' }))
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })
})
