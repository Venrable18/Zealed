// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EndpointHealth } from '../../lib/lightwalletd.ts'
import { AutoLockSetting } from './AutoLockSetting.tsx'
import { EndpointSettings } from './EndpointSettings.tsx'
import { COOLDOWN_MS, MAX_ATTEMPTS, REVEAL_MS, SeedExport } from './SeedExport.tsx'
import type { SeedPort } from './seedPort.ts'
import { WipeData, CONFIRM_WORD } from './WipeData.tsx'
import type { WipeDeps } from './wipe.ts'

const ENDPOINTS = [
  { label: 'Primary', url: 'https://one.test/testnet' },
  { label: 'Backup', url: 'https://two.test/testnet' },
]

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const healthy: EndpointHealth = {
  ok: true,
  latencyMs: 120,
  info: {
    version: 'v0.5.4',
    vendor: 'x',
    chainName: 'test',
    consensusBranchId: '77190ad9',
    blockHeight: 4_519_623,
    estimatedHeight: 4_519_623,
  },
}

describe('EndpointSettings', () => {
  it('lists the configured servers and lets one be chosen', () => {
    const selected: string[] = []
    render(
      <EndpointSettings
        selectedUrl={ENDPOINTS[0]?.url ?? ''}
        endpoints={ENDPOINTS}
        onSelect={(url) => void selected.push(url)}
      />,
    )
    expect(screen.getByRole('radio', { name: /Primary/ })).toHaveProperty('checked', true)
    fireEvent.click(screen.getByRole('radio', { name: /Backup/ }))
    expect(selected).toEqual(['https://two.test/testnet'])
  })

  it('checks only when asked, and shows height, upgrade and speed for a healthy server', async () => {
    const check = vi.fn(() => Promise.resolve(healthy))
    render(
      <EndpointSettings
        selectedUrl={ENDPOINTS[0]?.url ?? ''}
        endpoints={ENDPOINTS}
        onSelect={() => undefined}
        check={check}
      />,
    )
    expect(check).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Check Primary' }))
    expect((await screen.findByRole('status')).textContent).toContain(
      'Testnet, block 4,519,623, network upgrade NU7 (77190ad9), answered in 120 ms',
    )
    expect(check).toHaveBeenCalledWith('https://one.test/testnet')
    expect(check).toHaveBeenCalledOnce()
  })

  it('explains each way a check can fail', async () => {
    for (const [reason, text] of [
      ['unreachable', 'Could not connect'],
      ['timeout', 'took too long'],
      ['bad-response', 'not in a way Zealed understands'],
      ['wrong-network', 'not a testnet server'],
    ] as const) {
      const { unmount } = render(
        <EndpointSettings
          selectedUrl={ENDPOINTS[0]?.url ?? ''}
          endpoints={ENDPOINTS}
          onSelect={() => undefined}
          check={() => Promise.resolve({ ok: false, reason })}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Check Primary' }))
      expect((await screen.findByRole('alert')).textContent).toContain(text)
      unmount()
    }
  })

  it('names an upgrade it does not recognise as unknown, and says so when there is only one server', async () => {
    render(
      <EndpointSettings
        selectedUrl="https://one.test/testnet"
        endpoints={ENDPOINTS.slice(0, 1)}
        onSelect={() => undefined}
        check={() =>
          Promise.resolve({ ...healthy, info: { ...healthy.info, consensusBranchId: 'deadbeef' } })
        }
      />,
    )
    expect(screen.getByText(/only one server for now/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check Primary' }))
    expect((await screen.findByRole('status')).textContent).toContain(
      'network upgrade unknown (deadbeef)',
    )
  })
})

describe('AutoLockSetting', () => {
  it('offers the listed times with no "never", and reports a change', () => {
    const changes: number[] = []
    render(
      <AutoLockSetting minutes={5} onChange={(m) => void changes.push(m)} walletExists={false} />,
    )
    const select = screen.getByLabelText('Lock after')
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual([
      '1',
      '5',
      '15',
      '30',
      '60',
    ])
    fireEvent.change(select, { target: { value: '15' } })
    expect(changes).toEqual([15])
    expect(screen.getByText(/Saved now, and used once the wallet exists/)).toBeTruthy()
  })

  it('says what it does once there is a wallet', () => {
    render(<AutoLockSetting minutes={1} onChange={() => undefined} walletExists />)
    expect(screen.getByText(/locks and asks for your passphrase/)).toBeTruthy()
    expect(screen.getByRole('option', { name: '1 minute of inactivity' })).toBeTruthy()
  })
})

describe('SeedExport', () => {
  const WORDS = ['abandon', 'ability', 'able', 'about']
  function port(correct = 'right'): SeedPort & { verified: string[]; exported: number } {
    const p = {
      verified: [] as string[],
      exported: 0,
      verifyPassphrase: (passphrase: string) => {
        p.verified.push(passphrase)
        return Promise.resolve(passphrase === correct)
      },
      exportSeed: () => {
        p.exported++
        return Promise.resolve(WORDS)
      },
    }
    return p
  }

  async function askFor(passphrase: string) {
    fireEvent.click(screen.getByRole('button', { name: 'Show seed phrase' }))
    const dialog = await screen.findByRole('dialog', { name: 'Enter your passphrase' })
    fireEvent.change(within(dialog).getByLabelText('Passphrase'), { target: { value: passphrase } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Show|Checking/ }))
    return dialog
  }

  it('says there is no seed yet when there is no wallet', () => {
    render(<SeedExport port={null} />)
    expect(screen.getByText(/no seed phrase to show/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show seed phrase' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('shows nothing until the passphrase is right, and never reads the seed for a wrong one', async () => {
    const p = port()
    render(<SeedExport port={p} />)
    await askFor('wrong')
    expect(await screen.findByText('That passphrase is not right.')).toBeTruthy()
    expect(p.exported).toBe(0)
    expect(screen.queryByText('abandon')).toBeNull()
  })

  it('shows the words after the right passphrase, with a warning and no copy button', async () => {
    const p = port()
    render(<SeedExport port={p} />)
    await askFor('right')
    expect(await screen.findByText('abandon')).toBeTruthy()
    expect(screen.getByText(/Anyone with these words can take all your funds/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull()
    // The dialog is closed and the typed passphrase has been cleared from it.
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase').value).toBe('')
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Hide now' }))
    expect(screen.queryByText('abandon')).toBeNull()
  })

  it('hides the words by itself after a minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    render(<SeedExport port={port()} />)
    await askFor('right')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(screen.getByText('abandon')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVEAL_MS + 2000)
    })
    expect(screen.queryByText('abandon')).toBeNull()
  })

  it('pauses after too many wrong passphrases, without asking the wallet again', async () => {
    const p = port()
    render(<SeedExport port={p} />)
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const dialog = i === 0 ? await askFor('nope') : screen.getByRole('dialog')
      if (i > 0) {
        fireEvent.change(within(dialog).getByLabelText('Passphrase'), { target: { value: 'nope' } })
        fireEvent.click(within(dialog).getByRole('button', { name: /Show|Checking/ }))
      }
      await waitFor(() => {
        expect(p.verified).toHaveLength(i + 1)
      })
    }
    expect(await screen.findByText(/Too many wrong attempts/)).toBeTruthy()
    const locked = screen.getByRole('dialog')
    fireEvent.change(within(locked).getByLabelText('Passphrase'), { target: { value: 'right' } })
    fireEvent.click(within(locked).getByRole('button', { name: /Show|Checking/ }))
    expect(await screen.findByText(/Too many wrong attempts. Wait a moment/)).toBeTruthy()
    expect(p.verified).toHaveLength(MAX_ATTEMPTS)
    expect(p.exported).toBe(0)
    expect(COOLDOWN_MS).toBeGreaterThan(0)
  })

  it('shows nothing and says so if the wallet fails', async () => {
    const p = port()
    p.exportSeed = () => Promise.reject(new Error('boom'))
    render(<SeedExport port={p} />)
    await askFor('right')
    expect(await screen.findByText(/could not be read. Nothing was shown/)).toBeTruthy()
    expect(screen.queryByText('abandon')).toBeNull()
  })
})

describe('WipeData', () => {
  function deps() {
    const calls: string[] = []
    const d: WipeDeps = {
      localStorage: { clear: () => void calls.push('local') },
      sessionStorage: { clear: () => void calls.push('session') },
      indexedDB: undefined,
      resetStores: () => void calls.push('reset'),
    }
    return { d, calls }
  }

  it('does nothing until the exact word is typed', async () => {
    const { d, calls } = deps()
    const done = vi.fn()
    render(<WipeData deps={d} onDone={done} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wipe all local data' }))
    const dialog = await screen.findByRole('dialog', { name: 'Wipe all local data?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Wipe everything' }))
    expect(calls).toEqual([])
    fireEvent.change(within(dialog).getByLabelText(`Type ${CONFIRM_WORD}`), {
      target: { value: 'wipe' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Wipe everything' }))
    expect(calls).toEqual([])
    expect(within(dialog).getByText('The word must match exactly.')).toBeTruthy()
    expect(done).not.toHaveBeenCalled()
  })

  it('wipes once the word is typed, and tells the person', async () => {
    const { d, calls } = deps()
    const done = vi.fn()
    render(<WipeData deps={d} onDone={done} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wipe all local data' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(`Type ${CONFIRM_WORD}`), {
      target: { value: CONFIRM_WORD },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Wipe everything' }))
    await waitFor(() => {
      expect(done).toHaveBeenCalledOnce()
    })
    expect(calls).toEqual(['reset', 'local', 'session'])
    expect((await screen.findByRole('status')).textContent).toContain('Wiped.')
    expect(screen.getByRole('status').textContent).toContain('cannot list its databases')
  })

  it('can be cancelled', async () => {
    const { d, calls } = deps()
    render(<WipeData deps={d} onDone={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wipe all local data' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(calls).toEqual([])
  })
})
