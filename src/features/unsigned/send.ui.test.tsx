// @vitest-environment jsdom
import '../../test/nodeGlobals.ts'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastViewport } from '../../components/Toasts.tsx'
import type { Card } from './card.ts'
import { createCard, sendReply } from './service.ts'
import { FakeUnsignedWallet } from './fakeWallet.ts'
import { PrivacyGuidance } from './PrivacyGuidance.tsx'
import { parseReceipt } from './receipt.ts'
import { SendForm } from './SendForm.tsx'
import { SentMessages } from './SentMessages.tsx'
import { readInbox } from './inbox.ts'
import { useSentMessages } from './stores.ts'
import type { ReceivedTx } from './walletPort.ts'
import { VerifyReceipt } from './VerifyReceipt.tsx'

const MIN = 5_000_000n

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
  }
})

beforeEach(() => {
  useSentMessages.setState({ sent: [] })
})

afterEach(cleanup)

async function setup(overrides: Partial<Card> = {}) {
  const network = new Map<string, ReceivedTx[]>()
  const recipient = new FakeUnsignedWallet(network)
  const sender = new FakeUnsignedWallet(network)
  const made = await createCard(recipient, {
    name: 'Ada — tips',
    bio: 'Tell me.',
    minimumZat: MIN,
    acceptsReplies: true,
  })
  if (!made.ok) throw new Error('card failed')
  return { network, recipient, sender, card: { ...made.card, ...overrides } }
}

function write(body: string, amount = '0.05') {
  fireEvent.change(screen.getByLabelText('Your message'), { target: { value: body } })
  fireEvent.change(screen.getByLabelText('Payment (ZEC)'), { target: { value: amount } })
}

async function confirmSend() {
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  const dialog = await screen.findByRole('dialog', { name: 'Send this message?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Pay and send' }))
}

const renderForm = (card: Card, wallet: FakeUnsignedWallet | null) =>
  render(
    <>
      <SendForm card={card} wallet={wallet} />
      <SentMessages wallet={wallet} />
      <ToastViewport />
    </>,
  )

describe('PrivacyGuidance', () => {
  it('advises a separate wallet, no identifying details, and Tor Browser with its JavaScript caveat', () => {
    render(<PrivacyGuidance />)
    expect(screen.getByText(/Use a separate wallet/)).toBeTruthy()
    expect(screen.getByText(/Leave out details that identify you/)).toBeTruthy()
    expect(screen.getByText(/Tor Browser/).closest('li')?.textContent).toContain('needs JavaScript')
    expect(screen.getByText(/Tor Browser/).closest('li')?.textContent).toContain('“Safest”')
    expect(screen.getByRole('complementary', { name: 'Before you send' })).toBeTruthy()
  })
})

describe('SendForm', () => {
  it('explains each mistake next to its field', async () => {
    const { sender, card } = await setup()
    renderForm(card, sender)
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText('Write a message first.')).toBeTruthy()
    expect(screen.getByText('Enter how much to pay.')).toBeTruthy()
  })

  it('refuses a payment below the card’s minimum', async () => {
    const { sender, card } = await setup()
    renderForm(card, sender)
    write('Hello', '0.01')
    expect(screen.getByText('That is below the minimum amount.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText('Enter how much to pay.')).toBeTruthy()
    expect(sender.payments).toHaveLength(0)
  })

  it('counts bytes and refuses a message that is too long', async () => {
    const { sender, card } = await setup()
    renderForm(card, sender)
    write('a'.repeat(2049))
    expect(screen.getByText(/2049 of 2048 bytes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText(/A message can be up to 2048 bytes/)).toBeTruthy()
  })

  it('says plainly when there is no wallet and sends nothing', async () => {
    const { card } = await setup()
    renderForm(card, null)
    write('Hello')
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect((await screen.findByRole('alert')).textContent).toContain('wallet is not available yet')
  })

  it('previews the fee, asks first, then sends one payment the recipient can read', async () => {
    const { recipient, sender, card } = await setup()
    sender.fee = 30_000n
    renderForm(card, sender)
    write('The files are in the shed.')
    expect(await screen.findByText('Network fee', {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.getByText('0.0003 ZEC')).toBeTruthy()
    expect(screen.getByText('0.0503 ZEC')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    const dialog = await screen.findByRole('dialog', { name: 'Send this message?' })
    expect(
      within(dialog).getByText(/pays 0.05 ZEC to Ada — tips, plus a 0.0003 ZEC network fee/),
    ).toBeTruthy()
    expect(sender.payments).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Pay and send' }))
    expect(await screen.findByText('Message sent')).toBeTruthy()
    expect(sender.payments).toHaveLength(1)
    const [message] = await readInbox(await recipient.receivedTransactions(card.address), card)
    expect(message).toMatchObject({ body: 'The files are in the shed.', amountZat: MIN })
    expect(useSentMessages.getState().sent).toHaveLength(1)
  })

  it('only offers a reply address when the card accepts replies, and off by default', async () => {
    const accepting = await setup()
    const { unmount } = renderForm(accepting.card, accepting.sender)
    expect(screen.getByRole('checkbox', { name: /Allow a reply/ })).toHaveProperty('checked', false)
    unmount()
    const refusing = await setup({ acceptsReplies: false })
    renderForm(refusing.card, refusing.sender)
    expect(screen.queryByRole('checkbox', { name: /Allow a reply/ })).toBeNull()
  })

  it('says so, and sends nothing, when there is not enough money', async () => {
    const { sender, card } = await setup()
    sender.spendable = 1_000_000n
    renderForm(card, sender)
    write('Hello')
    await confirmSend()
    expect((await screen.findByRole('alert')).textContent).toContain('You have 0.01 ZEC to spend')
    expect(sender.payments).toHaveLength(0)
  })

  it('says nothing was paid when the send fails', async () => {
    const { sender, card } = await setup()
    renderForm(card, sender)
    write('Hello')
    sender.failNext = 'send'
    await confirmSend()
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was paid')
  })

  it('with a receipt: offers a download that is a real receipt, with no message text in it', async () => {
    const { sender, card } = await setup()
    const created: Blob[] = []
    let downloaded = ''
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      created.push(blob as Blob)
      return 'blob:test'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloaded = this.download
    })

    renderForm(card, sender)
    write('I saw the shipment on the 3rd.')
    fireEvent.click(screen.getByRole('checkbox', { name: /Keep a receipt/ }))
    await confirmSend()
    expect(await screen.findByText('Message sent')).toBeTruthy()
    expect(screen.getByText(/Keep this receipt/)).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Download receipt' })[0]!)
    expect(create).toHaveBeenCalledOnce()
    expect(downloaded).toMatch(/^zealed-receipt-.*\.json$/)
    const text = await created[0]?.text()
    expect(parseReceipt(text ?? '')).not.toBeNull()
    expect(text).not.toContain('shipment')
    vi.restoreAllMocks()
  })
})

describe('SentMessages', () => {
  it('is empty at first', () => {
    render(<SentMessages wallet={null} />)
    expect(screen.getByText('Nothing sent yet')).toBeTruthy()
  })

  it('finds a reply at the fresh reply address, and shows none before it arrives', async () => {
    const { recipient, sender, card } = await setup()
    renderForm(card, sender)
    write('Hello, I have information.')
    fireEvent.click(screen.getByRole('checkbox', { name: /Allow a reply/ }))
    await confirmSend()
    await screen.findByText('Message sent')

    fireEvent.click(screen.getByRole('button', { name: 'Check for replies' }))
    expect(await screen.findByText('No reply yet.')).toBeTruthy()

    const [message] = await readInbox(await recipient.receivedTransactions(card.address), card)
    expect(
      await sendReply(recipient, message?.replyTo ?? '', 'Thank you. Can you say more?'),
    ).toEqual({ ok: true })
    fireEvent.click(screen.getByRole('button', { name: 'Check for replies' }))
    expect(await screen.findByText('Thank you. Can you say more?')).toBeTruthy()
  })

  it('says when no reply address was left', async () => {
    const { sender, card } = await setup()
    renderForm(card, sender)
    write('Hello')
    await confirmSend()
    await screen.findByText('Message sent')
    expect(screen.getByText(/No reply address was left/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check for replies' })).toBeNull()
  })
})

describe('VerifyReceipt', () => {
  async function receivedWithReceipt() {
    const { recipient, sender, card } = await setup()
    const result = await (
      await import('./send.ts')
    ).sendMessage(
      sender,
      card,
      {
        body: 'I saw the shipment on the 3rd.',
        amountZat: MIN,
        allowReplies: false,
        keepReceipt: true,
      },
      { nowMs: 1_800_000_000_000 },
    )
    if (!result.ok || result.sent.receipt === undefined) throw new Error('expected a receipt')
    const messages = await readInbox(await recipient.receivedTransactions(card.address), card)
    return { messages, receipt: result.sent.receipt }
  }

  it('confirms a revealed message that matches a commitment in the inbox', async () => {
    const { messages, receipt } = await receivedWithReceipt()
    render(<VerifyReceipt messages={messages} />)
    fireEvent.change(screen.getByLabelText(/Salt, or the whole receipt/), {
      target: { value: receipt.saltHex },
    })
    fireEvent.change(screen.getByLabelText(/The message they say they sent/), {
      target: { value: 'I saw the shipment on the 3rd.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect((await screen.findByRole('status')).textContent).toContain('It matches.')
  })

  it('accepts the whole receipt file in the salt box', async () => {
    const { messages, receipt } = await receivedWithReceipt()
    const { serializeReceipt } = await import('./receipt.ts')
    render(<VerifyReceipt messages={messages} />)
    fireEvent.change(screen.getByLabelText(/Salt, or the whole receipt/), {
      target: { value: serializeReceipt(receipt) },
    })
    fireEvent.change(screen.getByLabelText(/The message they say they sent/), {
      target: { value: 'I saw the shipment on the 3rd.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect((await screen.findByRole('status')).textContent).toContain('It matches.')
  })

  it('does not match a changed message', async () => {
    const { messages, receipt } = await receivedWithReceipt()
    render(<VerifyReceipt messages={messages} />)
    fireEvent.change(screen.getByLabelText(/Salt, or the whole receipt/), {
      target: { value: receipt.saltHex },
    })
    fireEvent.change(screen.getByLabelText(/The message they say they sent/), {
      target: { value: 'I saw the shipment on the 4th.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'No message in your inbox carries this commitment',
    )
  })

  it('explains a bad salt or an empty message', async () => {
    render(<VerifyReceipt messages={[]} />)
    fireEvent.change(screen.getByLabelText(/The message they say they sent/), {
      target: { value: 'hi' },
    })
    fireEvent.change(screen.getByLabelText(/Salt, or the whole receipt/), {
      target: { value: 'nope' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect((await screen.findByRole('alert')).textContent).toContain('32 letters and digits')
    fireEvent.change(screen.getByLabelText(/Salt, or the whole receipt/), {
      target: { value: 'ab'.repeat(16) },
    })
    fireEvent.change(screen.getByLabelText(/The message they say they sent/), {
      target: { value: '  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Paste the message text first')
    })
  })
})
