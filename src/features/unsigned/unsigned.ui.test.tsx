// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToastViewport } from '../../components/Toasts.tsx'
import type { Card } from './card.ts'
import { CreateCardForm } from './CreateCardForm.tsx'
import { FakeUnsignedWallet } from './fakeWallet.ts'
import { InboxPanel } from './InboxPanel.tsx'
import { createCard } from './service.ts'
import { ShareCard } from './ShareCard.tsx'
import { useUnsigned } from './stores.ts'

const REPLY = 'utestreplyaddress0000000000000000001'
const MIN = 5_000_000n
const T = 1_800_000_000_000
const card: Card = {
  name: 'Ada — tips',
  bio: 'Tell me what you saw.',
  address: 'utestcardaddress00000000000000000001',
  minimumZat: MIN,
  acceptsReplies: true,
}

beforeEach(() => {
  useUnsigned.setState({ card: null, messages: [], repliedIds: [] })
})

afterEach(cleanup)

describe('CreateCardForm', () => {
  it('explains each mistake next to its field', async () => {
    render(<CreateCardForm onSubmit={(input) => createCard(null, input)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create contact card' }))
    expect(await screen.findByText('Give the card a name.')).toBeTruthy()
    expect(screen.getByText('Choose the smallest payment you will read.')).toBeTruthy()
    expect(screen.getByLabelText('Display name').getAttribute('aria-invalid')).toBe('true')
  })

  it('says plainly when the wallet is not available', async () => {
    render(<CreateCardForm onSubmit={(input) => createCard(null, input)} />)
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText(/Minimum payment/), { target: { value: '0.05' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create contact card' }))
    expect((await screen.findByRole('alert')).textContent).toContain('You need a wallet first')
  })

  it('passes the chosen settings through when the wallet works', async () => {
    const wallet = new FakeUnsignedWallet()
    let result: Awaited<ReturnType<typeof createCard>> | undefined
    render(
      <CreateCardForm
        onSubmit={async (input) => {
          result = await createCard(wallet, input)
          return result
        }}
      />,
    )
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText(/Short bio/), { target: { value: 'Hello' } })
    fireEvent.change(screen.getByLabelText(/Minimum payment/), { target: { value: '0.05' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Allow replies/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create contact card' }))
    await screen.findByRole('button', { name: 'Create contact card' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result?.ok && result.card).toMatchObject({
      name: 'Ada',
      bio: 'Hello',
      minimumZat: 5_000_000n,
      acceptsReplies: false,
    })
  })

  it('refuses a minimum below 0.001 ZEC', () => {
    render(<CreateCardForm onSubmit={(input) => createCard(null, input)} />)
    fireEvent.change(screen.getByLabelText(/Minimum payment/), { target: { value: '0.0001' } })
    expect(screen.getByText('That is below the minimum amount.')).toBeTruthy()
  })
})

describe('ShareCard', () => {
  it('shows the card, a QR code and a link with the card in the fragment', () => {
    render(<ShareCard card={card} />)
    expect(screen.getByText('Ada — tips')).toBeTruthy()
    expect(screen.getByText('Tell me what you saw.')).toBeTruthy()
    expect(screen.getByText(/Minimum payment:/).textContent).toContain('0.05 ZEC')
    expect(screen.getByText(/Replies are allowed/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /QR code for the contact card/ })).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('Card link').value).toContain('/u#')
    expect(screen.getByText(/does not turn the link off/)).toBeTruthy()
  })

  it('says when replies are off', () => {
    render(<ShareCard card={{ ...card, acceptsReplies: false }} />)
    expect(screen.getByText(/Replies are turned off/)).toBeTruthy()
  })
})

describe('InboxPanel', () => {
  function setup() {
    const wallet = new FakeUnsignedWallet()
    wallet.receive(card.address, {
      txid: 'paid',
      receivedAtMs: T,
      amountZat: 2_000_000_000n,
      messages: [{ body: 'The report is attached to the usual place.', replyTo: REPLY }],
    })
    wallet.receive(card.address, {
      txid: 'noreply',
      receivedAtMs: T + 1000,
      amountZat: MIN,
      messages: ['I cannot be reached.'],
    })
    wallet.receive(card.address, {
      txid: 'cheap',
      receivedAtMs: T + 2000,
      amountZat: 100_000n,
      messages: [{ body: 'Cheap spam message', replyTo: REPLY }],
    })
    return wallet
  }

  const renderInbox = (wallet: FakeUnsignedWallet | null, c: Card = card) =>
    render(
      <>
        <InboxPanel card={c} wallet={wallet} />
        <ToastViewport />
      </>,
    )

  it('is empty at first, with earnings at zero', () => {
    renderInbox(new FakeUnsignedWallet())
    expect(screen.getByText('No messages yet')).toBeTruthy()
    expect(screen.getByLabelText('Earned through this card').textContent).toContain('0 ZEC')
    expect(screen.getByRole('button', { name: 'Check for messages' })).toBeTruthy()
  })

  it('shows paid messages with amount and time, and keeps underpaid ones in a closed folder', async () => {
    renderInbox(setup())
    fireEvent.click(screen.getByRole('button', { name: 'Check for messages' }))
    expect(await screen.findByText('The report is attached to the usual place.')).toBeTruthy()
    expect(screen.getByText('I cannot be reached.')).toBeTruthy()
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent.includes('· paid 20 ZEC')),
    ).toBeTruthy()

    const folder = screen.getByText('Below minimum (1)').closest('details')
    expect(folder).not.toBeNull()
    expect(folder?.open).toBe(false)
    expect(within(folder as HTMLElement).getByText('Cheap spam message')).toBeTruthy()
    // The hidden message is not among the visible paid ones.
    expect(screen.getAllByText(/Cheap spam message/)).toHaveLength(1)
  })

  it('summarises what the card has earned', async () => {
    renderInbox(setup())
    fireEvent.click(screen.getByRole('button', { name: 'Check for messages' }))
    await screen.findByText('I cannot be reached.')
    const earnings = screen.getByLabelText('Earned through this card')
    expect(earnings.textContent).toContain('20.051 ZEC')
    expect(earnings.textContent).toContain('2 messages met your minimum')
    expect(earnings.textContent).toContain('1 below it (0.001 ZEC, included above)')
  })

  it('offers Reply only where the sender left an address, and sends it there', async () => {
    const wallet = setup()
    renderInbox(wallet)
    fireEvent.click(screen.getByRole('button', { name: 'Check for messages' }))
    await screen.findByText('I cannot be reached.')
    expect(screen.getAllByRole('button', { name: 'Reply' })).toHaveLength(2)
    expect(screen.getByText('The sender did not leave a way to reply.')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]!)
    fireEvent.change(screen.getByLabelText(/Reply to/), {
      target: { value: 'Thank you, I will act on it.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
    expect(await screen.findByText('Your reply was sent.')).toBeTruthy()
    expect(wallet.sent).toHaveLength(1)
    expect(wallet.sent[0]?.to).toBe(REPLY)
    expect(screen.getByText('You replied.')).toBeTruthy()
  })

  it('refuses an empty or oversized reply, and says when the send fails', async () => {
    const wallet = setup()
    renderInbox(wallet)
    fireEvent.click(screen.getByRole('button', { name: 'Check for messages' }))
    await screen.findByText('I cannot be reached.')
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
    expect(screen.getByText('Write a reply first.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Reply to/), { target: { value: 'a'.repeat(2049) } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
    expect(screen.getByText(/A reply can be up to 2048 bytes. This one is 2049/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Reply to/), { target: { value: 'fine' } })
    wallet.failNext = 'send'
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
    expect(await screen.findByText('The reply could not be sent. Try again.')).toBeTruthy()
    expect(wallet.sent).toHaveLength(0)
  })

  it('does not offer replies when the card turned them off', async () => {
    renderInbox(setup(), { ...card, acceptsReplies: false })
    fireEvent.click(screen.getByRole('button', { name: 'Check for messages' }))
    await screen.findByText('I cannot be reached.')
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
    expect(screen.getAllByText('Replies are turned off for this card.').length).toBeGreaterThan(0)
  })

  it('cannot check without a wallet, and reports a wallet failure', async () => {
    const { unmount } = renderInbox(null)
    expect(
      screen.getByRole('button', { name: 'Check for messages' }).hasAttribute('disabled'),
    ).toBe(true)
    unmount()
    const wallet = new FakeUnsignedWallet()
    wallet.failNext = 'read'
    renderInbox(wallet)
    fireEvent.click(screen.getByRole('button', { name: 'Check for messages' }))
    expect(await screen.findByText('Could not check for messages. Try again.')).toBeTruthy()
  })

  it('shows a message as plain text, never as markup', async () => {
    const wallet = new FakeUnsignedWallet()
    wallet.receive(card.address, {
      txid: 'x',
      receivedAtMs: T,
      amountZat: MIN,
      messages: ['<img src=x onerror=alert(1)> <b>bold</b>'],
    })
    const { container } = renderInbox(wallet)
    fireEvent.click(screen.getByRole('button', { name: 'Check for messages' }))
    expect(await screen.findByText('<img src=x onerror=alert(1)> <b>bold</b>')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })
})
