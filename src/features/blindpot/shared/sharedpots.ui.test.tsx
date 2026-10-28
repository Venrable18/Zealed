// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_SHARED_STATE } from './engine.ts'
import type { SharedPotPort } from './port.ts'
import { SharedPotsPanel } from './SharedPotsPanel.tsx'
import { SharedWithdraw } from './SharedWithdraw.tsx'
import { SharedPotContext, useSharedPots } from './store.ts'
import type { SharedPot, Withdrawal } from './types.ts'

const POT_ADDRESS = 'utest1potaddresspotaddresspotaddress'
const HOST = 'utest1hostaddresshostaddresshostaddress'
const ME = 'utest1meaddressmeaddressmeaddressmeaddr'

function withdrawal(outputs: { address: string; zat: string }[]): Withdrawal {
  return {
    id: 'w'.repeat(32),
    signerPczt: '',
    request: { sighash: '', spends: [], outputs },
    status: 'pending',
    commitments: {},
    shares: {},
    declinedBy: [],
    createdAtMs: 1,
  }
}

function coHostPot(w: Withdrawal): SharedPot {
  return {
    id: 'p'.repeat(32),
    name: 'Amara’s naming ceremony',
    role: 'cohost',
    me: 2,
    threshold: 2,
    members: [
      { index: 1, address: HOST },
      { index: 2, address: ME },
    ],
    viewingSeed: '',
    status: 'ready',
    declinedBy: [],
    round1: {},
    round2: {},
    address: POT_ADDRESS,
    accountId: '7',
    withdrawals: [w],
    createdAtMs: 1,
  }
}

const port = { potSpendableZat: () => Promise.resolve(1_000_000n) } as unknown as SharedPotPort

function show(w: Withdrawal) {
  useSharedPots.setState({ state: { ...EMPTY_SHARED_STATE, pots: [coHostPot(w)] } })
  render(
    <MemoryRouter>
      <SharedPotContext.Provider value={port}>
        <SharedPotsPanel />
      </SharedPotContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useSharedPots.setState({ state: EMPTY_SHARED_STATE })
})
afterEach(cleanup)

describe('a co-host reading a withdrawal request', () => {
  it('is told plainly when the host takes everything in the pot', () => {
    show(withdrawal([{ address: HOST, zat: '990000' }]))
    expect(screen.getByText('Withdraws everything in the pot')).toBeTruthy()
    expect(screen.getByText(/0\.0099 TAZ to/)).toBeTruthy()
  })

  it('is told how much stays when the host takes only part', () => {
    show(
      withdrawal([
        { address: HOST, zat: '300000' },
        { address: POT_ADDRESS, zat: '590000' },
      ]),
    )
    expect(screen.getByText(/Withdraws part of the pot: 0\.0059 TAZ stays in it/)).toBeTruthy()
    expect(screen.queryByText('Withdraws everything in the pot')).toBeNull()
    // Only what leaves is listed as a payment; the rest is change back to the pot.
    expect(screen.getByText(/0\.003 TAZ to/)).toBeTruthy()
  })
})

describe('the host choosing what to withdraw', () => {
  function hostView() {
    const pot: SharedPot = { ...coHostPot(withdrawal([])), role: 'host', me: 1, withdrawals: [] }
    useSharedPots.setState({ state: { ...EMPTY_SHARED_STATE, pots: [pot] } })
    render(
      <SharedPotContext.Provider value={port}>
        <SharedWithdraw sharedId={pot.id} onSent={() => undefined} />
      </SharedPotContext.Provider>,
    )
  }

  it('offers everything or an amount, and asks for the amount only when it is chosen', async () => {
    hostView()
    const ask = screen.getByRole('button', { name: 'Ask co-hosts to approve a withdrawal' })
    expect(screen.getByLabelText<HTMLInputElement>(/Everything in the pot/).checked).toBe(true)
    expect(screen.queryByLabelText('Amount to withdraw (ZEC)')).toBeNull()
    expect(ask.hasAttribute('disabled')).toBe(false)
    expect(await screen.findByText(/0\.01 TAZ, less the network fee/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText(/An amount/))
    const amount = screen.getByLabelText('Amount to withdraw (ZEC)')
    // No amount yet: nothing to ask for.
    expect(ask.hasAttribute('disabled')).toBe(true)
    fireEvent.change(amount, { target: { value: '0.003' } })
    expect(ask.hasAttribute('disabled')).toBe(false)
    // More than the pot can pay with the fee is refused before anything is sent.
    fireEvent.change(amount, { target: { value: '5' } })
    expect(ask.hasAttribute('disabled')).toBe(true)
  })
})
