// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Toasts } from './testSupport.tsx'
import { CreatePotForm } from './CreatePotForm.tsx'
import { FakeWallet } from './fakeWallet.ts'
import { HostViewPanel } from './HostViewPanel.tsx'
import { createPot } from './service.ts'
import { SharePot } from './SharePot.tsx'
import type { Pot } from './types.ts'

const MINUTE = 60_000

function makePot(overrides: Partial<Pot> = {}): Pot {
  return {
    id: 'c'.repeat(32),
    name: 'Ada and Tunde',
    cover: '🎁',
    eventDate: '2026-12-01',
    endDate: '2026-12-31',
    batchIntervalMs: 60 * MINUTE,
    createdAtMs: Date.now() - 61 * MINUTE,
    accountId: 'acct-1',
    address: 'utest1fakeaddressfakeaddressfakeaddress',
    closed: false,
    ...overrides,
  }
}

beforeAll(() => {
  // jsdom has no <dialog> modal support; this stands in for it.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
  }
})

afterEach(cleanup)

describe('CreatePotForm', () => {
  const noWallet = (input: Parameters<typeof createPot>[1]) =>
    createPot(null, input, { nowMs: Date.now(), batchIntervalMs: 60 * MINUTE })

  it('explains each mistake next to its field', async () => {
    render(
      <CreatePotForm
        batchIntervalMs={60 * MINUTE}
        onSubmit={noWallet}
        onCreated={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create pot' }))
    expect(await screen.findByText('Give the pot a name.')).toBeTruthy()
    expect(screen.getByText('Choose the event date.')).toBeTruthy()
    expect(screen.getByLabelText('Pot name').getAttribute('aria-invalid')).toBe('true')
  })

  it('tells the host plainly when the wallet is not available', async () => {
    render(
      <CreatePotForm
        batchIntervalMs={60 * MINUTE}
        onSubmit={noWallet}
        onCreated={() => undefined}
      />,
    )
    fireEvent.change(screen.getByLabelText('Pot name'), { target: { value: 'Ada' } })
    const future = '2099-01-01'
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: future } })
    fireEvent.change(screen.getByLabelText('Last day for gifts'), { target: { value: future } })
    fireEvent.click(screen.getByRole('button', { name: 'Create pot' }))
    expect((await screen.findByRole('alert')).textContent).toContain('You need a wallet first')
  })

  it('creates the pot when the wallet works', async () => {
    const wallet = new FakeWallet()
    let created: Pot | undefined
    render(
      <CreatePotForm
        batchIntervalMs={60 * MINUTE}
        onSubmit={(input) =>
          createPot(wallet, input, { nowMs: Date.now(), batchIntervalMs: 60 * MINUTE })
        }
        onCreated={(pot) => {
          created = pot
        }}
      />,
    )
    fireEvent.change(screen.getByLabelText('Pot name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '2099-01-01' } })
    fireEvent.change(screen.getByLabelText('Last day for gifts'), {
      target: { value: '2099-02-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create pot' }))
    await waitFor(() => {
      expect(created?.name).toBe('Ada')
    })
  })

  it('says how often the total refreshes', () => {
    render(
      <CreatePotForm batchIntervalMs={60_000} onSubmit={noWallet} onCreated={() => undefined} />,
    )
    expect(screen.getByText('1 minute')).toBeTruthy()
  })
})

describe('HostViewPanel', () => {
  it('shows the total, strength and wishes, and nothing per payment', async () => {
    const wallet = new FakeWallet()
    const createdAt = Date.now() - 61 * MINUTE
    wallet.payments.push(
      { atMs: createdAt + MINUTE, zat: 100_000n, wish: 'Congratulations!' },
      { atMs: createdAt + 2 * MINUTE, zat: 500_000n, wish: 'Many happy years' },
    )
    const { container } = render(
      <HostViewPanel
        pot={makePot({ createdAtMs: createdAt })}
        wallet={wallet}
        onClosed={() => undefined}
      />,
    )

    expect(await screen.findByText('0.006')).toBeTruthy()
    expect(screen.getByText('Weak', { exact: false })).toBeTruthy()
    expect(screen.getByText('Congratulations!')).toBeTruthy()
    expect(screen.getByText('Many happy years')).toBeTruthy()
    // No individual amounts or times anywhere.
    expect(container.textContent).not.toContain('0.001')
    expect(container.textContent).not.toContain('0.005')
    expect(container.querySelectorAll('time').length).toBe(0)
  })

  it('says when the total cannot be loaded', async () => {
    const wallet = new FakeWallet()
    wallet.failNext = 'read'
    render(<HostViewPanel pot={makePot()} wallet={wallet} onClosed={() => undefined} />)
    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded')
  })

  it('asks before closing, then withdraws and reports', async () => {
    const wallet = new FakeWallet()
    let closed = false
    render(
      <>
        <HostViewPanel
          pot={makePot()}
          wallet={wallet}
          onClosed={() => {
            closed = true
          }}
        />
        <Toasts />
      </>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Close pot and withdraw' }))
    const dialog = await screen.findByRole('dialog', { name: 'Close this pot?' })
    expect(wallet.withdrawn).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close and withdraw' }))
    await waitFor(() => {
      expect(closed).toBe(true)
    })
    expect(wallet.withdrawn).toBe(true)
    expect(screen.getByText('Pot closed. Everything was sent to your main account.')).toBeTruthy()
  })

  it('keeps the pot open and says so if the withdrawal fails', async () => {
    const wallet = new FakeWallet()
    wallet.failNext = 'withdraw'
    let closed = false
    render(
      <>
        <HostViewPanel
          pot={makePot()}
          wallet={wallet}
          onClosed={() => {
            closed = true
          }}
        />
        <Toasts />
      </>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Close pot and withdraw' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close and withdraw' }))
    expect(
      await screen.findByText('The pot could not be closed. Nothing was moved. Try again.'),
    ).toBeTruthy()
    expect(closed).toBe(false)
  })
})

describe('SharePot', () => {
  it('offers the private link first and warns about the weaker wallet-to-wallet option', () => {
    render(
      <MemoryRouter>
        <SharePot pot={makePot()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('img', { name: 'QR code for the Ada and Tunde pot link' })).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Payment request QR code for the Ada and Tunde pot' }),
    ).toBeTruthy()
    expect(screen.getByText('Weaker privacy.')).toBeTruthy()
    const link = screen.getByLabelText<HTMLInputElement>('Pot link').value
    expect(link).toContain('/blind-pot/give#pot=')
  })
})
