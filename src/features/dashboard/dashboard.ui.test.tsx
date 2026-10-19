// @vitest-environment jsdom
import '../../test/nodeGlobals.ts'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dashboard } from '../../app/routes/Dashboard.tsx'
import { usePots } from '../blindpot/potStore.ts'
import { PotWalletContext } from '../blindpot/walletPort.ts'
import { useSilent } from '../legacy/silent/stores.ts'
import { useLegacy } from '../legacy/stores.ts'
import { useSentMessages, useUnsigned } from '../unsigned/stores.ts'
import { fullScenario } from './scenario.ts'
import { DashboardWalletContext } from './walletPort.ts'
import type { DashboardInput } from './stats.ts'

afterEach(cleanup)

beforeEach(() => {
  usePots.setState({ pots: [] })
  useLegacy.setState({ sent: [], inbox: [] })
  useSilent.setState({ owned: [], guardians: [], heirs: [] })
  useUnsigned.setState({ card: null, messages: [], repliedIds: [] })
  useSentMessages.setState({ sent: [] })
})

function load(input: DashboardInput) {
  usePots.setState({ pots: [...input.pots] })
  useLegacy.setState({ sent: [...input.legacySent], inbox: [...input.legacyInbox] })
  useSilent.setState({
    owned: [...input.owned],
    guardians: [...input.guardians],
    heirs: [...input.heirs],
  })
  useUnsigned.setState({ card: input.card, messages: [...input.messages], repliedIds: [] })
  useSentMessages.setState({ sent: [...input.sentMessages] })
}

const card = (name: string) => screen.getByRole('region', { name })

describe('Dashboard', () => {
  it('says it is computed on this device, and shows empty states with no wallet or data', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )
    expect(screen.getByRole('note').textContent).toBe(
      'Your dashboard is computed on this device. We can’t see it.',
    )
    expect(screen.getByText(/wallet is not available yet, so there is no balance/)).toBeTruthy()
    expect(screen.getByText('No pots yet.')).toBeTruthy()
    expect(within(card('Unsigned')).getByText('None yet')).toBeTruthy()
  })

  it('shows the right numbers after the earlier scenarios', async () => {
    const { potWallet, ...scenario } = await fullScenario(Date.now())
    load(scenario)
    render(
      <MemoryRouter>
        <DashboardWalletContext.Provider
          value={{
            balance: () =>
              Promise.resolve(scenario.balance ?? { spendableZat: 0n, pendingZat: 0n }),
          }}
        >
          <PotWalletContext.Provider value={potWallet}>
            <Dashboard />
          </PotWalletContext.Provider>
        </DashboardWalletContext.Provider>
      </MemoryRouter>,
    )

    const wallet = card('Wallet')
    expect(await within(wallet).findByText('Spendable now')).toBeTruthy()
    expect(wallet.textContent).toContain('3.25 ZEC')
    expect(wallet.textContent).toContain('0.1 ZEC')

    const pots = card('Blind Pot')
    expect(within(pots).getByText('2 (1 open, 1 closed)')).toBeTruthy()
    await waitFor(() => {
      expect(pots.textContent).toContain('0.6 ZEC')
    })
    expect(pots.textContent).toContain('privacy weak')
    expect(pots.textContent).toContain('Old pot')
    expect(pots.textContent).not.toContain('5.6')

    const legacy = card('Legacy')
    expect(legacy.textContent).toContain('Letters sealed and sent')
    expect(within(legacy).getByText('2 (1 ready, 1 locked)')).toBeTruthy()
    expect(within(legacy).getByText('2 (1 ready to open)')).toBeTruthy()
    expect(within(legacy).getByText('Not delivered yet')).toBeTruthy()
    expect(
      within(legacy)
        .getAllByRole('alert')
        .map((a) => a.textContent)
        .join(' '),
    ).toContain('A check-in is overdue')
    expect(legacy.textContent).toContain('missed a check-in')

    const unsigned = card('Unsigned')
    expect(unsigned.textContent).toContain('Active')
    expect(unsigned.textContent).toContain('Messages received2')
    expect(unsigned.textContent).toContain('Below your minimum1')
    expect(unsigned.textContent).toContain('2.06 ZEC')
    expect(unsigned.textContent).toContain('Messages you sent1')
  })

  it('shows a clear message, not wrong numbers, when the balance or pot totals cannot be read', async () => {
    const { potWallet, ...scenario } = await fullScenario(Date.now())
    load(scenario)
    potWallet.failNext = 'read'
    render(
      <MemoryRouter>
        <DashboardWalletContext.Provider
          value={{ balance: () => Promise.reject(new Error('boom')) }}
        >
          <PotWalletContext.Provider value={potWallet}>
            <Dashboard />
          </PotWalletContext.Provider>
        </DashboardWalletContext.Provider>
      </MemoryRouter>,
    )
    expect(await within(card('Wallet')).findByRole('alert')).toBeTruthy()
    expect(within(card('Wallet')).getByRole('alert').textContent).toContain(
      'balance could not be read',
    )
    await waitFor(() => {
      expect(within(card('Blind Pot')).getByRole('alert').textContent).toContain(
        'could not be read',
      )
    })
    expect(card('Wallet').textContent).not.toContain('ZEC')
  })
})
