// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { decodeMemo } from '../../zmp/index.ts'
import { createMemoryContributionStore } from './contributionStore.ts'
import { FakeContributorWallet } from './fakeWallet.ts'
import { GiftFlow } from './GiftFlow.tsx'
import type { SharedPot } from './shareLink.ts'
import { decodeWish } from './wishes.ts'

const pot: SharedPot = {
  id: 'd'.repeat(32),
  name: 'Ada and Tunde',
  cover: '🎁',
  eventDate: '2099-01-01',
  endDate: '2099-02-01',
  address: 'utest1fakeaddressfakeaddressfakeaddress',
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
  }
})

afterEach(cleanup)

function renderFlow(wallet: FakeContributorWallet | null, overrides: Partial<SharedPot> = {}) {
  return render(
    <GiftFlow
      pot={{ ...pot, ...overrides }}
      wallet={wallet}
      delays={{ min: 0, max: 0 }}
      tickMs={5}
      store={createMemoryContributionStore()}
    />,
  )
}

function fill(amount: string, wish?: string) {
  fireEvent.change(screen.getByLabelText('Gift amount (ZEC)'), { target: { value: amount } })
  if (wish !== undefined)
    fireEvent.change(screen.getByLabelText(/A wish for the host/), { target: { value: wish } })
}

async function confirmSend() {
  fireEvent.click(screen.getByRole('button', { name: 'Send gift' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }))
}

describe('GiftFlow', () => {
  it('shows the exact amount and number of pieces before sending', () => {
    renderFlow(new FakeContributorWallet())
    fill('0.5')
    expect(screen.getByText(/You will send/).textContent).toContain('0.5 ZEC in 1 piece')
    fill('0.5', 'Best wishes')
    expect(screen.getByText(/You will send/).textContent).toContain('0.501 ZEC')
    expect(screen.getByText(/Rounded from 0.5 ZEC/).textContent).toContain(
      'make room for your wish',
    )
  })

  it('refuses a wish the host could not show', () => {
    renderFlow(new FakeContributorWallet())
    fill('0.05', 'a'.repeat(141))
    expect(screen.getByText('Keep your wish to 140 characters or fewer.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send gift' }).hasAttribute('disabled')).toBe(true)
  })

  it('sends separate pieces, the wish only on the 0.001 piece, then shows a private receipt', async () => {
    const wallet = new FakeContributorWallet()
    renderFlow(wallet)
    fill('0.05', 'Congratulations!')
    await confirmSend()

    expect(await screen.findByText('Thank you', {}, { timeout: 4000 })).toBeTruthy()
    expect(screen.getByText(/You sent 0.05 ZEC in 6 pieces/)).toBeTruthy()
    expect(screen.getByText(/Congratulations!/)).toBeTruthy()
    expect(screen.getByText(/This receipt is only for you/)).toBeTruthy()

    expect(wallet.sent).toHaveLength(6)
    expect(wallet.sent.reduce((sum, s) => sum + s.zat, 0n)).toBe(5_000_000n)
    const withMemo = wallet.sent.filter((s) => s.memo !== undefined)
    expect(withMemo).toHaveLength(1)
    expect(withMemo[0]?.zat).toBe(100_000n)
    const decoded = decodeMemo(withMemo[0]?.memo ?? new Uint8Array())
    expect(decoded.kind === 'chunk' && decodeWish(decoded.chunk.payload)).toBe('Congratulations!')
  })

  it('shows progress while sending and tells the guest to keep the page open', async () => {
    const wallet = new FakeContributorWallet()
    wallet.sendPiece = async (args) => {
      await new Promise((resolve) => setTimeout(resolve, 40))
      return { ok: true, txid: String(args.zat) }
    }
    renderFlow(wallet)
    fill('0.05')
    await confirmSend()
    expect(await screen.findByText(/pieces sent/)).toBeTruthy()
    expect(screen.getByText(/Keep this page open/)).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
    await screen.findByText('Thank you', {}, { timeout: 4000 })
  })

  it('says so and sends nothing when the balance is too low', async () => {
    const wallet = new FakeContributorWallet()
    wallet.spendable = 1_000_000n
    renderFlow(wallet)
    fill('0.05')
    await confirmSend()
    expect((await screen.findByRole('alert')).textContent).toContain('You have 0.01 ZEC to spend')
    expect(wallet.sent).toHaveLength(0)
  })

  it('pauses when funds run out and continues after the guest adds more', async () => {
    const wallet = new FakeContributorWallet()
    wallet.script = [{ ok: false, reason: 'insufficient-funds' }]
    renderFlow(wallet)
    fill('0.05')
    await confirmSend()
    expect((await screen.findByRole('alert', {}, { timeout: 3000 })).textContent).toContain(
      'ran out of funds',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Thank you', {}, { timeout: 4000 })).toBeTruthy()
  })

  it('says plainly that there is no wallet and sends nothing', () => {
    renderFlow(null)
    expect(screen.getByText(/wallet is still being built/)).toBeTruthy()
    fill('0.05')
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }))
    expect(screen.getByRole('alert').textContent).toContain('wallet is not available yet')
  })

  it('does not take gifts after the last day', () => {
    renderFlow(new FakeContributorWallet(), { endDate: '2020-01-01' })
    expect(screen.getByText(/closed to gifts/)).toBeTruthy()
    expect(screen.queryByLabelText('Gift amount (ZEC)')).toBeNull()
  })

  it('resumes a gift already started for this pot', async () => {
    const wallet = new FakeContributorWallet()
    const store = createMemoryContributionStore()
    const first = render(
      <GiftFlow pot={pot} wallet={null} delays={{ min: 0, max: 0 }} tickMs={5} store={store} />,
    )
    first.unmount()
    // Start one through a wallet, then mount again with the same store.
    const live = render(
      <GiftFlow pot={pot} wallet={wallet} delays={{ min: 0, max: 0 }} tickMs={5} store={store} />,
    )
    fill('0.5')
    await confirmSend()
    await screen.findByText('Thank you', {}, { timeout: 4000 })
    live.unmount()
    render(
      <GiftFlow pot={pot} wallet={wallet} delays={{ min: 0, max: 0 }} tickMs={5} store={store} />,
    )
    expect(await screen.findByText('Thank you')).toBeTruthy()
    await waitFor(() => {
      expect(wallet.sent).toHaveLength(1)
    })
  })
})
