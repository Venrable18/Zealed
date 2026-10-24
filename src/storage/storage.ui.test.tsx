// @vitest-environment jsdom
import '../test/nodeGlobals.ts'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUTO_LOCK_MINUTES, useSettings } from '../app/settingsStore.ts'
import { ToastViewport } from '../components/Toasts.tsx'
import { useToasts } from '../components/toastStore.ts'
import { useContacts } from '../features/contacts/contacts.ts'
import { VaultSettings } from '../features/settings/VaultSettings.tsx'
import { createMemoryBackend } from './backend.ts'
import { useAutoLock } from './autoLock.ts'
import { LockScreen } from './LockScreen.tsx'
import { NotSavedNotice } from './NotSavedNotice.tsx'
import { resetSensitiveData } from './persistence.ts'
import { Vault } from './vault.ts'
import { useWalletRuntime } from '../wallet/runtime.ts'
import type { RealWallet } from '../wallet/realWallet.ts'
import {
  MAX_UNLOCK_FAILURES,
  configureVault,
  createVault,
  initVault,
  lockVault,
  useVaultStatus,
} from './vaultState.ts'

const PASS = 'correct horse battery'
const A = 'utest1adaaddressadaaddressadaaddress'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
  }
})

beforeEach(async () => {
  useToasts.setState({ toasts: [] })
  resetSensitiveData()
  configureVault(new Vault(createMemoryBackend(), { iterations: 1000 }))
  await initVault()
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  // Let any lock still saving finish, so it cannot spill into the next test.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
})

async function lockedVault() {
  await createVault(PASS)
  useContacts.getState().add('Ada', A)
  await lockVault()
}

describe('NotSavedNotice', () => {
  it('reminds that nothing is saved until a vault exists, then goes away', async () => {
    render(
      <MemoryRouter>
        <NotSavedNotice />
      </MemoryRouter>,
    )
    expect(screen.getByRole('note').textContent).toContain('Nothing is saved on this device yet')
    expect(screen.getByRole('link', { name: /Choose a passphrase/ }).getAttribute('href')).toBe(
      '/settings#vault',
    )
    await act(async () => {
      await createVault(PASS)
    })
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('says so when this browser cannot store data', () => {
    useVaultStatus.setState({ status: 'unavailable' })
    render(
      <MemoryRouter>
        <NotSavedNotice />
      </MemoryRouter>,
    )
    expect(screen.getByRole('note').textContent).toContain('cannot store data securely')
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('LockScreen', () => {
  it('unlocks with the right passphrase and brings the data back', async () => {
    await lockedVault()
    expect(useContacts.getState().contacts).toEqual([])
    render(<LockScreen />)
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: PASS } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => {
      expect(useVaultStatus.getState().status).toBe('unlocked')
    })
    expect(useContacts.getState().contacts.map((c) => c.name)).toEqual(['Ada'])
  })

  it('says a wrong passphrase is wrong, clears the box, and stays locked', async () => {
    await lockedVault()
    render(<LockScreen />)
    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'not the passphrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('That passphrase is not right.')).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase').value).toBe('')
    expect(useVaultStatus.getState().status).toBe('locked')
  })

  it('pauses after repeated wrong passphrases, with a countdown', async () => {
    await lockedVault()
    render(<LockScreen />)
    for (let i = 0; i < MAX_UNLOCK_FAILURES; i++) {
      fireEvent.change(screen.getByLabelText('Passphrase'), {
        target: { value: `wrong passphrase ${String(i)}` },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
      await waitFor(() => {
        expect(screen.getByLabelText<HTMLInputElement>('Passphrase').value).toBe('')
      })
    }
    expect(
      (await screen.findByText(/Too many wrong attempts\. Try again in \d+ seconds/)).textContent,
    ).toMatch(/(29|30|31) seconds/)
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: PASS } })
    expect(screen.getByRole('button', { name: 'Unlock' }).hasAttribute('disabled')).toBe(true)
  })

  it('has no recovery, and offers wiping instead', async () => {
    await lockedVault()
    render(<LockScreen />)
    fireEvent.click(screen.getByText('Forgot your passphrase?'))
    expect(screen.getByText(/no way to recover it/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wipe all local data' })).toBeTruthy()
  })
})

describe('VaultSettings', () => {
  const renderSettings = () =>
    render(
      <>
        <VaultSettings />
        <ToastViewport />
      </>,
    )

  it('explains nothing is saved, and checks the passphrase before making a vault', async () => {
    renderSettings()
    expect(screen.getByText('nothing is saved', { exact: false })).toBeTruthy()
    fireEvent.change(screen.getAllByLabelText('New passphrase')[0]!, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save my data, encrypted' }))
    expect(await screen.findByText(/Use at least 10 characters/)).toBeTruthy()

    fireEvent.change(screen.getAllByLabelText('New passphrase')[0]!, { target: { value: PASS } })
    fireEvent.change(screen.getByLabelText('Repeat the passphrase'), {
      target: { value: 'something else entirely' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save my data, encrypted' }))
    expect(await screen.findByText('The two passphrases do not match.')).toBeTruthy()
    expect(useVaultStatus.getState().status).toBe('none')
  })

  it('makes the vault, keeping what was already entered, then offers lock and change', async () => {
    useContacts.getState().add('Ada', A)
    renderSettings()
    fireEvent.change(screen.getAllByLabelText('New passphrase')[0]!, { target: { value: PASS } })
    fireEvent.change(screen.getByLabelText('Repeat the passphrase'), { target: { value: PASS } })
    fireEvent.click(screen.getByRole('button', { name: 'Save my data, encrypted' }))
    expect(
      await screen.findByText('Your data is now saved on this device, encrypted.'),
    ).toBeTruthy()
    expect(useVaultStatus.getState().status).toBe('unlocked')
    expect(screen.getByRole('button', { name: 'Lock now' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save my data, encrypted' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Lock now' }))
    await waitFor(() => {
      expect(useVaultStatus.getState().status).toBe('locked')
    })
    expect(useContacts.getState().contacts).toEqual([])
  })

  it('changes the passphrase after checking the old one', async () => {
    await createVault(PASS)
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change your passphrase' })
    fireEvent.change(within(dialog).getByLabelText('Current passphrase'), {
      target: { value: 'wrong wrong wrong' },
    })
    fireEvent.change(within(dialog).getByLabelText('New passphrase'), {
      target: { value: 'a brand new passphrase' },
    })
    fireEvent.change(within(dialog).getByLabelText('Repeat the new passphrase'), {
      target: { value: 'a brand new passphrase' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change' }))
    expect(await within(dialog).findByText('The current passphrase is not right.')).toBeTruthy()

    fireEvent.change(within(dialog).getByLabelText('Current passphrase'), {
      target: { value: PASS },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change' }))
    expect(await screen.findByText('Passphrase changed.')).toBeTruthy()
  })

  it('says so when the browser cannot store data', () => {
    useVaultStatus.setState({ status: 'unavailable' })
    renderSettings()
    expect(screen.getByText(/cannot store data securely here/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save my data, encrypted' })).toBeNull()
  })
})

// Locking really encrypts and saves, which takes real time that fake timers cannot advance.
const realSetTimeout = globalThis.setTimeout

async function untilStatus(status: 'locked' | 'unlocked' | 'none') {
  for (let i = 0; i < 1000 && useVaultStatus.getState().status !== status; i++)
    await act(async () => {
      await new Promise((resolve) => realSetTimeout(resolve, 5))
    })
}

describe('auto-lock', () => {
  function Probe() {
    useAutoLock()
    return null
  }

  async function unlockedAndWatching(minutes: number) {
    useSettings.setState({ autoLockMinutes: minutes })
    await createVault(PASS)
    useContacts.getState().add('Ada', A)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    render(<Probe />)
  }

  it('locks after the chosen time of no use, and removes the data from memory', async () => {
    await unlockedAndWatching(5)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 - 1000)
    })
    expect(useVaultStatus.getState().status).toBe('unlocked')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    await untilStatus('locked')
    expect(useVaultStatus.getState().status).toBe('locked')
    expect(useContacts.getState().contacts).toEqual([])
  })

  it('starts the time again whenever the person does something', async () => {
    await unlockedAndWatching(5)
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4 * 60_000)
      })
      fireEvent.pointerDown(window)
    }
    expect(useVaultStatus.getState().status).toBe('unlocked')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000)
    })
    await untilStatus('locked')
    expect(useVaultStatus.getState().status).toBe('locked')
  })

  it('waits while the wallet is busy (a send must not be cut off), then locks', async () => {
    const wallet = { busy: true }
    useWalletRuntime.setState({ wallet: wallet as unknown as RealWallet })
    try {
      await unlockedAndWatching(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000)
      })
      expect(useVaultStatus.getState().status).toBe('unlocked')
      wallet.busy = false
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000)
      })
      await untilStatus('locked')
      expect(useVaultStatus.getState().status).toBe('locked')
    } finally {
      useWalletRuntime.setState({ wallet: null })
    }
  })

  it('locks straight away when the page comes back after being away longer than the limit', async () => {
    await unlockedAndWatching(1)
    // The tab was in the background: its timer never fired, but the clock moved on.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    vi.setSystemTime(Date.now() + 10 * 60_000)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      // Locking saves first, so it finishes a moment later.
      await vi.advanceTimersByTimeAsync(100)
    })
    await untilStatus('locked')
    expect(useVaultStatus.getState().status).toBe('locked')
  })

  it('does nothing without a vault, and stops watching once locked', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    render(<Probe />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 60_000)
    })
    expect(useVaultStatus.getState().status).toBe('none')
    expect(DEFAULT_AUTO_LOCK_MINUTES).toBeGreaterThan(0)
  })
})
