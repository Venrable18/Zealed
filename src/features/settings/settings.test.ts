// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_LOCK_OPTIONS,
  DEFAULT_AUTO_LOCK_MINUTES,
  useSettings,
} from '../../app/settingsStore.ts'
import { LIGHTWALLET_ENDPOINTS } from '../../config/network.ts'
import { memoryContributionStore } from '../blindpot/contributionStore.ts'
import { usePots } from '../blindpot/potStore.ts'
import { useSilent } from '../legacy/silent/stores.ts'
import { useLegacy } from '../legacy/stores.ts'
import { useSentMessages, useUnsigned } from '../unsigned/stores.ts'
import { resetAllStores, wipeLocalData, type WipeDeps } from './wipe.ts'

/** The `state` object zustand saves, typed so the tests can read it. */
function savedState(): Record<string, unknown> {
  const saved = JSON.parse(localStorage.getItem('zealed:settings') ?? '{}') as {
    state?: Record<string, unknown>
  }
  return saved.state ?? {}
}

const DEFAULT_URL = LIGHTWALLET_ENDPOINTS[0]?.url ?? ''

beforeEach(() => {
  localStorage.clear()
  useSettings.setState({
    demoMode: false,
    theme: 'system',
    endpointUrl: DEFAULT_URL,
    autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
  })
})

describe('settings store', () => {
  it('only accepts a configured server, so storage cannot point the app elsewhere', () => {
    useSettings.getState().setEndpointUrl('https://evil.example/testnet')
    expect(useSettings.getState().endpointUrl).toBe(DEFAULT_URL)
    useSettings.getState().setEndpointUrl(DEFAULT_URL)
    expect(useSettings.getState().endpointUrl).toBe(DEFAULT_URL)
  })

  it('only accepts the listed auto-lock times, with no "never"', () => {
    for (const bad of [0, -1, 2, 1000, Number.NaN]) {
      useSettings.getState().setAutoLockMinutes(bad)
      expect(useSettings.getState().autoLockMinutes).toBe(DEFAULT_AUTO_LOCK_MINUTES)
    }
    for (const option of AUTO_LOCK_OPTIONS) {
      useSettings.getState().setAutoLockMinutes(option)
      expect(useSettings.getState().autoLockMinutes).toBe(option)
    }
    expect(AUTO_LOCK_OPTIONS).not.toContain(0)
  })

  it('saves choices, and replaces tampered saved values with safe defaults', async () => {
    useSettings.getState().setAutoLockMinutes(15)
    expect(savedState()).toMatchObject({
      autoLockMinutes: 15,
      endpointUrl: DEFAULT_URL,
    })

    localStorage.setItem(
      'zealed:settings',
      JSON.stringify({
        state: {
          endpointUrl: 'https://evil.example',
          autoLockMinutes: 0,
          theme: 'purple',
          demoMode: 'yes',
        },
        version: 0,
      }),
    )
    await useSettings.persist.rehydrate()
    expect(useSettings.getState()).toMatchObject({
      endpointUrl: DEFAULT_URL,
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      theme: 'system',
      demoMode: false,
    })

    localStorage.setItem('zealed:settings', 'not json at all')
    await expect(useSettings.persist.rehydrate()).resolves.not.toThrow()
    expect(useSettings.getState().endpointUrl).toBe(DEFAULT_URL)
  })

  it('stores nothing private', () => {
    useSettings.getState().setTheme('dark')
    expect(Object.keys(savedState()).sort()).toEqual([
      'autoLockMinutes',
      'demoMode',
      'endpointUrl',
      'theme',
    ])
  })
})

describe('wipeLocalData', () => {
  function deps(over: Partial<WipeDeps> = {}) {
    const calls: string[] = []
    const result: WipeDeps = {
      localStorage: { clear: () => void calls.push('local') },
      sessionStorage: { clear: () => void calls.push('session') },
      indexedDB: {
        databases: () => Promise.resolve([{ name: 'wallet' }, { name: 'cache' }, {}]),
        deleteDatabase: (name: string) => {
          calls.push(`delete:${name}`)
          const request = {} as IDBOpenDBRequest
          queueMicrotask(() => {
            request.onsuccess?.(new Event('success'))
          })
          return request
        },
      },
      resetStores: () => void calls.push('reset'),
      ...over,
    }
    return { result, calls }
  }

  it('resets memory, deletes every database, and clears storage last', async () => {
    const { result, calls } = deps()
    expect(await wipeLocalData(result)).toEqual({ databasesDeleted: 2, databasesUnknown: false })
    expect(calls).toEqual(['reset', 'delete:wallet', 'delete:cache', 'local', 'session'])
  })

  it('reports when the browser cannot list its databases', async () => {
    const { result, calls } = deps({ indexedDB: undefined })
    expect(await wipeLocalData(result)).toEqual({ databasesDeleted: 0, databasesUnknown: true })
    expect(calls).toEqual(['reset', 'local', 'session'])
    const noList = deps({
      indexedDB: { deleteDatabase: vi.fn() } as unknown as WipeDeps['indexedDB'],
    })
    expect((await wipeLocalData(noList.result)).databasesUnknown).toBe(true)
  })

  it('carries on when a database is blocked or fails to delete', async () => {
    const calls: string[] = []
    const result = await wipeLocalData({
      localStorage: { clear: () => void calls.push('local') },
      sessionStorage: { clear: () => void calls.push('session') },
      indexedDB: {
        databases: () => Promise.resolve([{ name: 'a' }, { name: 'b' }]),
        deleteDatabase: (name: string) => {
          const request = {} as IDBOpenDBRequest
          queueMicrotask(() => {
            if (name === 'a') request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent)
            else request.onerror?.(new Event('error'))
          })
          return request
        },
      },
      resetStores: () => undefined,
    })
    expect(result.databasesDeleted).toBe(2)
    expect(calls).toEqual(['local', 'session'])
  })
})

describe('resetAllStores', () => {
  it('empties every store the app keeps, and puts settings back to defaults', async () => {
    usePots.setState({ pots: [{ id: 'x' } as never] })
    useLegacy.setState({ sent: [{ id: 'x' } as never], inbox: [{ id: 'x' } as never] })
    useSilent.setState({ owned: [{} as never], guardians: [{} as never], heirs: [{} as never] })
    useUnsigned.setState({ card: {} as never, messages: [{} as never], repliedIds: ['x'] })
    useSentMessages.setState({ sent: [{} as never] })
    await memoryContributionStore.save({
      id: 'c',
      potId: 'p',
      address: 'a',
      createdAtMs: 1,
      pieces: [],
    })
    useSettings.getState().setDemoMode(true)
    useSettings.getState().setTheme('dark')

    resetAllStores()

    expect(usePots.getState().pots).toEqual([])
    expect(useLegacy.getState()).toMatchObject({ sent: [], inbox: [] })
    expect(useSilent.getState()).toMatchObject({ owned: [], guardians: [], heirs: [] })
    expect(useUnsigned.getState()).toMatchObject({ card: null, messages: [], repliedIds: [] })
    expect(useSentMessages.getState().sent).toEqual([])
    expect(await memoryContributionStore.load('p')).toBeUndefined()
    expect(useSettings.getState()).toMatchObject({ demoMode: false, theme: 'system' })
  })
})
