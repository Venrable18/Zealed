// @vitest-environment jsdom
import '../../../test/nodeGlobals.ts'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ToastViewport } from '../../../components/Toasts.tsx'
import { FakeLegacyWallet, FakeNetwork } from '../fakeWallet.ts'
import { GuardianPanel } from './GuardianPanel.tsx'
import { HeirPanel } from './HeirPanel.tsx'
import { OwnerPanel } from './OwnerPanel.tsx'
import { SetupSilent } from './SetupSilent.tsx'
import { checkIncoming } from './incoming.ts'
import { releaseAction } from './guardian.ts'
import { setupSilentLetter, type SilentInput } from './owner.ts'
import { useSilent } from './stores.ts'

const P = 120_000
const G = 60_000
const letter = 'To my family: the documents are in the blue folder.'
const addr = (name: string) => `utest1${name.padEnd(30, 'x')}`
const [OWNER, G1, G2, G3, HEIR] = [
  'owner',
  'guardianone',
  'guardiantwo',
  'guardianthree',
  'heir',
].map(addr) as [string, string, string, string, string]

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
  }
})

beforeEach(() => {
  useSilent.setState({ owned: [], guardians: [], heirs: [] })
})

afterEach(cleanup)

function actors() {
  const network = new FakeNetwork()
  const wallet = (address: string) => new FakeLegacyWallet({ address, network })
  return {
    network,
    owner: wallet(OWNER),
    g1: wallet(G1),
    g2: wallet(G2),
    g3: wallet(G3),
    heir: wallet(HEIR),
  }
}

const input = (overrides: Partial<SilentInput> = {}): SilentInput => ({
  heirAddress: HEIR,
  guardianAddresses: [G1, G2, G3],
  threshold: 2,
  periodMs: P,
  graceMs: G,
  letter,
  amountZat: 100_000_000n,
  ...overrides,
})

/** Sets a letter up `agoMs` in the past, so statuses are deterministic against the real clock. */
async function setupAgo(agoMs: number) {
  const a = actors()
  const result = await setupSilentLetter(a.owner, input(), { nowMs: Date.now() - agoMs })
  if (!result.ok) throw new Error('setup failed')
  return { ...a, record: result.record }
}

async function guardiansLoad(wallet: FakeLegacyWallet) {
  const state = await checkIncoming(wallet, { guardians: [], owned: [], heirs: [] }, Date.now())
  useSilent.setState({ guardians: state.guardians })
}

describe('SetupSilent', () => {
  const renderSetup = (wallet: FakeLegacyWallet | null) =>
    render(
      <>
        <SetupSilent wallet={wallet} defaultPeriodMs={P} defaultGraceMs={G} />
        <ToastViewport />
      </>,
    )

  function fillSetup() {
    fireEvent.change(screen.getByLabelText(/Heir’s Zealed address/), { target: { value: HEIR } })
    fireEvent.change(screen.getByLabelText('Guardian 1 address'), { target: { value: G1 } })
    fireEvent.change(screen.getByLabelText('Guardian 2 address'), { target: { value: G2 } })
    fireEvent.change(screen.getByLabelText('Guardian 3 address'), { target: { value: G3 } })
    fireEvent.change(screen.getByLabelText('Your letter'), { target: { value: letter } })
  }

  it('starts with the demo or standard timers split into friendly units', () => {
    renderSetup(null)
    expect(screen.getByLabelText('Check in every')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('Check in every unit')).toHaveProperty('value', 'minutes')
    expect(screen.getByLabelText('Then wait')).toHaveProperty('value', '1')
  })

  it('explains each mistake next to its field', () => {
    renderSetup(new FakeLegacyWallet())
    fireEvent.click(screen.getByRole('button', { name: 'Seal and send' }))
    expect(screen.getByText('Enter the heir’s Zealed address.')).toBeTruthy()
    expect(screen.getByText('Every guardian needs a valid Zcash address.')).toBeTruthy()
    expect(screen.getByText('Write something to seal.')).toBeTruthy()
  })

  it('lets guardians be added and removed within 2 to 5, and keeps the threshold valid', () => {
    renderSetup(null)
    expect(screen.getAllByLabelText(/Guardian \d address/)).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Add a guardian' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a guardian' }))
    expect(screen.getAllByLabelText(/Guardian \d address/)).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'Add a guardian' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Guardians needed to open the letter'), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove guardian 5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove guardian 4' }))
    expect(screen.getByLabelText('Guardians needed to open the letter')).toHaveProperty(
      'value',
      '3',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove guardian 3' }))
    expect(screen.queryByRole('button', { name: /Remove guardian/ })).toBeNull()
  })

  it('says plainly there is no wallet and seals nothing', () => {
    renderSetup(null)
    fillSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Seal and send' }))
    expect(screen.getByRole('alert').textContent).toContain('wallet is not available yet')
    expect(useSilent.getState().owned).toHaveLength(0)
  })

  it('asks first, then seals and delivers to the heir and every guardian', async () => {
    const a = actors()
    renderSetup(a.owner)
    fillSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Seal and send' }))
    const dialog = await screen.findByRole('dialog', { name: 'Seal this letter?' })
    expect(within(dialog).getByText(/2 of your 3 guardians/)).toBeTruthy()
    expect(within(dialog).getByText(/every 2 minutes/)).toBeTruthy()
    expect(within(dialog).getByText(/Guardians only act when they open Zealed/)).toBeTruthy()
    expect(a.network.inboxes.size).toBe(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Seal and send' }))
    expect(
      await screen.findByText(
        'Your letter is sealed. Remember to check in.',
        {},
        { timeout: 5000 },
      ),
    ).toBeTruthy()
    expect(useSilent.getState().owned).toHaveLength(1)
    for (const to of [HEIR, G1, G2, G3])
      expect(a.network.inboxes.get(to)?.length).toBeGreaterThan(0)
  })
})

describe('OwnerPanel', () => {
  it('shows the next check-in, checks in with one tap, and tells guardians', async () => {
    const s = await setupAgo(30_000)
    useSilent.setState({ owned: [s.record] })
    render(
      <>
        <OwnerPanel wallet={s.owner} />
        <ToastViewport />
      </>,
    )
    expect(screen.getByText(/Next check-in due in/)).toBeTruthy()
    const before = s.network.inboxes.get(G1)?.length ?? 0
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }))
    expect(await screen.findByText('Checked in.')).toBeTruthy()
    expect(useSilent.getState().owned[0]?.counter).toBe(2)
    expect(s.network.inboxes.get(G1)?.length).toBeGreaterThan(before)
  })

  it('warns when a check-in is overdue', async () => {
    const s = await setupAgo(P + 5000)
    useSilent.setState({ owned: [s.record] })
    render(<OwnerPanel wallet={s.owner} />)
    expect(screen.getByRole('alert').textContent).toContain('Check-in overdue')
  })

  it('shows how many times guardians reminded the owner', async () => {
    const s = await setupAgo(30_000)
    useSilent.setState({ owned: [{ ...s.record, nudgeIds: ['a', 'b'] }] })
    render(<OwnerPanel wallet={s.owner} />)
    expect(screen.getByText(/reminded you 2 times/)).toBeTruthy()
  })

  it('asks before revoking, then tells guardians and shows it as revoked', async () => {
    const s = await setupAgo(30_000)
    useSilent.setState({ owned: [s.record] })
    render(
      <>
        <OwnerPanel wallet={s.owner} />
        <ToastViewport />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Revoke letter' }))
    const dialog = await screen.findByRole('dialog', { name: 'Revoke this letter?' })
    const before = s.network.inboxes.get(G2)?.length ?? 0
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }))
    expect(await screen.findByText(/Revoked\. Guardians were told/)).toBeTruthy()
    expect(s.network.inboxes.get(G2)?.length).toBeGreaterThan(before)
    expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull()
  })

  it('offers a retry for messages that were not delivered', async () => {
    const s = await setupAgo(30_000)
    const stuck = { ...s.record, pending: [{ to: G1, memos: [new Uint8Array(512)] }] }
    useSilent.setState({ owned: [stuck] })
    render(
      <>
        <OwnerPanel wallet={s.owner} />
        <ToastViewport />
      </>,
    )
    expect(screen.getByRole('alert').textContent).toContain('have not been delivered')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Everything was delivered.')).toBeTruthy()
    expect(useSilent.getState().owned[0]?.pending).toHaveLength(0)
  })
})

describe('GuardianPanel', () => {
  it('shows OK with a countdown while the owner is checking in', async () => {
    const s = await setupAgo(10_000)
    await guardiansLoad(s.g1)
    render(<GuardianPanel wallet={s.g1} autoRelease={false} />)
    expect(screen.getByText('OK')).toBeTruthy()
    expect(screen.getByText(/Check-in due in/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Release/ })).toBeNull()
  })

  it('alerts when overdue and lets the guardian remind the owner', async () => {
    const s = await setupAgo(P + 5000)
    await guardiansLoad(s.g1)
    render(
      <>
        <GuardianPanel wallet={s.g1} autoRelease={false} />
        <ToastViewport />
      </>,
    )
    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('missed their check-in')
    expect(screen.queryByRole('button', { name: 'Release to the heir' })).toBeNull()
    const before = s.network.inboxes.get(OWNER)?.length ?? 0
    fireEvent.click(screen.getByRole('button', { name: 'Remind the owner' }))
    expect(await screen.findByText('A reminder was sent.')).toBeTruthy()
    expect(s.network.inboxes.get(OWNER)?.length).toBeGreaterThan(before)
  })

  it('after the grace period, asks before releasing, then sends the share and erases it', async () => {
    const s = await setupAgo(P + G + 5000)
    await guardiansLoad(s.g1)
    render(
      <>
        <GuardianPanel wallet={s.g1} autoRelease={false} />
        <ToastViewport />
      </>,
    )
    expect(screen.getByText('Ready to release')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Release to the heir' }))
    const dialog = await screen.findByRole('dialog', { name: 'Release your share?' })
    expect(s.network.inboxes.get(HEIR)?.length).toBeGreaterThan(0)
    const before = s.network.inboxes.get(HEIR)?.length ?? 0
    fireEvent.click(within(dialog).getByRole('button', { name: 'Release' }))
    expect(await screen.findByText('The key share was sent to the heir.')).toBeTruthy()
    expect(s.network.inboxes.get(HEIR)?.length).toBeGreaterThan(before)
    expect(useSilent.getState().guardians[0]).toMatchObject({ released: true, share: undefined })
    expect(screen.getByText(/erased from this device/)).toBeTruthy()
  })

  it('demo mode: releases by itself, once', async () => {
    const s = await setupAgo(P + G + 5000)
    await guardiansLoad(s.g1)
    const before = s.network.inboxes.get(HEIR)?.length ?? 0
    render(
      <>
        <GuardianPanel wallet={s.g1} autoRelease />
        <ToastViewport />
      </>,
    )
    expect(
      await screen.findByText('The key share was sent to the heir.', {}, { timeout: 4000 }),
    ).toBeTruthy()
    const after = s.network.inboxes.get(HEIR)?.length ?? 0
    expect(after).toBeGreaterThan(before)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(s.network.inboxes.get(HEIR)?.length).toBe(after)
  })

  it('shows a revoked letter as revoked with no release option', async () => {
    const s = await setupAgo(P + G + 5000)
    await guardiansLoad(s.g1)
    const record = useSilent.getState().guardians[0]
    if (record === undefined) throw new Error('expected a record')
    useSilent.setState({ guardians: [{ ...record, revoked: true, share: undefined }] })
    render(<GuardianPanel wallet={s.g1} autoRelease={false} />)
    expect(screen.getByText('Revoked')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Release/ })).toBeNull()
    expect(releaseAction(record, Date.now())).not.toBeNull()
  })

  it('is empty when nobody has chosen this person', () => {
    render(<GuardianPanel wallet={null} autoRelease={false} />)
    expect(screen.getByText('You are not guarding anyone')).toBeTruthy()
  })
})

describe('HeirPanel', () => {
  async function withReleases(count: number) {
    const s = await setupAgo(P + G + 5000)
    const guardians = [s.g1, s.g2, s.g3].slice(0, count)
    for (const wallet of guardians) {
      const { guardians: records } = await checkIncoming(
        wallet,
        { guardians: [], owned: [], heirs: [] },
        Date.now(),
      )
      const action = records[0] === undefined ? null : releaseAction(records[0], Date.now())
      if (action === null) throw new Error('expected a release')
      await wallet.sendMemos(action)
    }
    const state = await checkIncoming(s.heir, { guardians: [], owned: [], heirs: [] }, Date.now())
    useSilent.setState({ heirs: state.heirs })
    return s
  }

  it('shows how many shares have arrived and keeps Open disabled until enough have', async () => {
    const s = await withReleases(1)
    render(<HeirPanel wallet={s.heir} />)
    expect(screen.getByText(/Waiting for guardians \(1 of 2 shares\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open letter' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByText(/blue folder/)).toBeNull()
  })

  it('opens at the threshold and moves the gift into the wallet', async () => {
    const s = await withReleases(2)
    render(
      <>
        <HeirPanel wallet={s.heir} />
        <ToastViewport />
      </>,
    )
    expect(screen.getByText(/Waiting for guardians \(2 of 2 shares\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open letter' }))
    expect(await screen.findByText(/blue folder/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Move the gift into my wallet' }))
    expect(await screen.findByText(/Moved 0\.99975 ZEC into your wallet/)).toBeTruthy()
    expect(s.heir.swept).toHaveLength(1)
  })

  it('is empty when nothing has been left to this person', () => {
    render(<HeirPanel wallet={null} />)
    expect(screen.getByText('Nothing waiting for you')).toBeTruthy()
  })

  it('shows a letter as plain text, never as markup', async () => {
    const a = actors()
    const result = await setupSilentLetter(
      a.owner,
      input({ letter: '<img src=x onerror=alert(1)>', amountZat: null }),
      { nowMs: Date.now() - P - G - 5000 },
    )
    if (!result.ok) throw new Error('setup failed')
    for (const wallet of [a.g1, a.g2]) {
      const { guardians } = await checkIncoming(
        wallet,
        { guardians: [], owned: [], heirs: [] },
        Date.now(),
      )
      const action = guardians[0] === undefined ? null : releaseAction(guardians[0], Date.now())
      if (action === null) throw new Error('expected a release')
      await wallet.sendMemos(action)
    }
    useSilent.setState({
      heirs: (await checkIncoming(a.heir, { guardians: [], owned: [], heirs: [] }, Date.now()))
        .heirs,
    })
    const { container } = render(<HeirPanel wallet={a.heir} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open letter' }))
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    await waitFor(() => {
      expect(container.querySelector('img')).toBeNull()
    })
  })
})
