import { beforeEach, describe, expect, it } from 'vitest'
import { useToasts } from '../components/toastStore.ts'
import { memoryContributionStore } from '../features/blindpot/contributionStore.ts'
import { usePots } from '../features/blindpot/potStore.ts'
import type { Pot } from '../features/blindpot/types.ts'
import { useContacts } from '../features/contacts/contacts.ts'
import { useSilent } from '../features/legacy/silent/stores.ts'
import type { OwnerRecord } from '../features/legacy/silent/owner.ts'
import { useLegacy } from '../features/legacy/stores.ts'
import { useSentMessages, useUnsigned } from '../features/unsigned/stores.ts'
import { createMemoryBackend } from './backend.ts'
import { BINDINGS, resetSensitiveData, startPersistence } from './persistence.ts'
import { Vault } from './vault.ts'
import {
  MAX_UNLOCK_FAILURES,
  UNLOCK_COOLDOWN_MS,
  changeVaultPassphrase,
  configureVault,
  createVault,
  initVault,
  lockVault,
  unlockVault,
  useVaultStatus,
  verifyVaultPassphrase,
  wipeVault,
} from './vaultState.ts'

const PASS = 'correct horse battery'
const A = 'utest1adaaddressadaaddressadaaddress'

const pot: Pot = {
  id: 'a'.repeat(32),
  name: 'Ada and Tunde',
  cover: '🎁',
  eventDate: '2099-01-01',
  endDate: '2099-02-01',
  batchIntervalMs: 3_600_000,
  createdAtMs: 1_800_000_000_000,
  accountId: 'acct',
  address: A,
  closed: false,
}

const owner: OwnerRecord = {
  bundleIdHex: 'b'.repeat(32),
  heirAddress: A,
  guardianAddresses: [A, A],
  threshold: 2,
  periodMs: 120_000,
  graceMs: 60_000,
  createdAtMs: 5,
  counter: 3,
  lastCheckInMs: 9,
  privateKey: Uint8Array.from({ length: 32 }, (_, i) => i),
  amountZat: 25_000_000n,
  pending: [{ to: A, memos: [Uint8Array.from([1, 2, 3])] }],
  giftSeed: 'seed words one',
  revoked: false,
  nudgeIds: ['n1'],
}

/** Puts a recognisable piece of data in every store the app keeps. */
function fill() {
  usePots.setState({ pots: [pot] })
  useContacts.getState().add('Ada', A)
  useLegacy.setState({
    sent: [
      {
        id: 's1',
        bundleIdHex: 's1',
        recipient: A,
        unlockMs: 9,
        createdAtMs: 1,
        amountZat: 5n,
        status: 'sent',
      },
    ],
    inbox: [{ bundleIdHex: 'i1', bundle: Uint8Array.from([7, 7]), unlockMs: 9, receivedAtMs: 1 }],
  })
  useSilent.setState({ owned: [owner], guardians: [], heirs: [] })
  useUnsigned.setState({
    card: { name: 'Source', bio: '', address: A, minimumZat: 5_000_000n, acceptsReplies: true },
    messages: [
      {
        id: 'm1',
        txid: 't',
        receivedAtMs: 1,
        amountZat: 6_000_000n,
        body: 'hello',
        commitment: Uint8Array.from([9]),
        belowMinimum: false,
      },
    ],
    repliedIds: ['m1'],
  })
  useSentMessages.setState({
    sent: [{ id: 'x', cardName: 'Bo', recipient: A, amountZat: 5n, sentAtMs: 1 }],
  })
  void memoryContributionStore.save({
    id: 'c',
    potId: pot.id,
    address: A,
    createdAtMs: 1,
    pieces: [{ zat: 100_000n, wish: 'hi', status: 'pending', notBeforeMs: 2, attempts: 0 }],
  })
}

function snapshot() {
  return JSON.stringify(
    BINDINGS.map((b) => [b.name, b.read()]),
    (_k, v: unknown) =>
      typeof v === 'bigint' ? `${v.toString()}n` : v instanceof Uint8Array ? Array.from(v) : v,
  )
}

beforeEach(() => {
  resetSensitiveData()
  configureVault(undefined)
})

describe('startPersistence', () => {
  async function freshVault() {
    const backend = createMemoryBackend()
    const vault = new Vault(backend, { iterations: 1000 })
    await vault.create(PASS)
    return { backend, vault }
  }

  it('writes what is in memory straight away when a vault is created', async () => {
    const { backend, vault } = await freshVault()
    fill()
    const p = await startPersistence(vault, { load: false })
    expect([...backend.records.keys()].sort()).toEqual(BINDINGS.map((b) => b.name).sort())
    p.stop()
  })

  it('saves every later change after a short delay, and flush waits for it', async () => {
    const { backend, vault } = await freshVault()
    const p = await startPersistence(vault, { load: false, debounceMs: 20 })
    useContacts.getState().add('Ada', A)
    const before = backend.records.get('contacts.v1')
    await p.flush()
    expect(backend.records.get('contacts.v1')).not.toEqual(before)
    expect(await vault.get('contacts.v1')).toEqual(useContacts.getState().contacts)
    p.stop()
  })

  it('restores every kind of data exactly, including bigint and bytes', async () => {
    const { backend, vault } = await freshVault()
    fill()
    const before = snapshot()
    const p = await startPersistence(vault, { load: false })
    await p.flush()
    p.stop()

    resetSensitiveData()
    expect(snapshot()).not.toBe(before)
    vault.lock()
    const again = new Vault(backend, { iterations: 1000 })
    await again.unlock(PASS)
    const loaded = await startPersistence(again, { load: true })
    expect(snapshot()).toBe(before)
    expect(useSilent.getState().owned[0]?.privateKey).toEqual(owner.privateKey)
    expect(usePots.getState().pots[0]?.batchIntervalMs).toBe(3_600_000)
    expect((await memoryContributionStore.load(pot.id))?.pieces[0]?.zat).toBe(100_000n)
    loaded.stop()
  })

  it('keeps nothing readable in storage', async () => {
    const { backend, vault } = await freshVault()
    fill()
    const p = await startPersistence(vault, { load: false })
    await p.flush()
    p.stop()
    const raw = new TextDecoder('latin1').decode(
      Uint8Array.from([...backend.records.values()].flatMap((r) => Array.from(r))),
    )
    for (const secret of ['Ada and Tunde', 'seed words one', 'hello', A, 'Source'])
      expect(raw).not.toContain(secret)
  })

  it('stops saving after stop()', async () => {
    const { backend, vault } = await freshVault()
    const p = await startPersistence(vault, { load: false, debounceMs: 5 })
    p.stop()
    useContacts.getState().add('Ada', A)
    await new Promise((r) => setTimeout(r, 40))
    expect(await vault.get('contacts.v1')).toEqual([])
    expect(backend.records.size).toBeGreaterThan(0)
  })

  it('ignores saved data of the wrong shape instead of breaking', async () => {
    const { backend, vault } = await freshVault()
    await vault.set('pots.v1', { not: 'a list' })
    await vault.set('legacy.v1', 'nonsense')
    await vault.set('silent.v1', { owned: 'oops', guardians: null })
    await vault.set('unsigned.v1', { card: 5, messages: 'x' })
    await vault.set('contacts.v1', 42)
    const p = await startPersistence(vault, { load: true })
    expect(usePots.getState().pots).toEqual([])
    expect(useLegacy.getState()).toMatchObject({ sent: [], inbox: [] })
    expect(useSilent.getState()).toMatchObject({ owned: [], guardians: [], heirs: [] })
    expect(useUnsigned.getState()).toMatchObject({ card: null, messages: [] })
    expect(useContacts.getState().contacts).toEqual([])
    p.stop()
    expect(backend.records.size).toBeGreaterThan(0)
  })

  it('resetSensitiveData empties every store', () => {
    fill()
    resetSensitiveData()
    expect(useContacts.getState().contacts).toEqual([])
    expect(usePots.getState().pots).toEqual([])
    expect(useSilent.getState().owned).toEqual([])
    expect(useUnsigned.getState().card).toBeNull()
    expect(memoryContributionStore.entries()).toEqual([])
  })
})

describe('vault state', () => {
  const setup = () => {
    const backend = createMemoryBackend()
    configureVault(new Vault(backend, { iterations: 1000 }))
    return backend
  }

  it('starts unknown, then finds there is no vault', async () => {
    setup()
    expect(useVaultStatus.getState().status).toBe('checking')
    await initVault()
    expect(useVaultStatus.getState().status).toBe('none')
  })

  it('creates a vault from the current data, and locking removes all private data from memory', async () => {
    setup()
    await initVault()
    fill()
    expect(await createVault(PASS)).toEqual({ ok: true })
    expect(useVaultStatus.getState().status).toBe('unlocked')
    await lockVault()
    expect(useVaultStatus.getState().status).toBe('locked')
    expect(useContacts.getState().contacts).toEqual([])
    expect(usePots.getState().pots).toEqual([])
    expect(useSilent.getState().owned).toEqual([])
    expect(useUnsigned.getState().messages).toEqual([])
  })

  it('locking also clears messages on screen, which can name people', async () => {
    setup()
    await initVault()
    await createVault(PASS)
    useToasts.getState().push('success', 'Ada was saved.')
    await lockVault()
    expect(useToasts.getState().toasts).toEqual([])
  })

  it('unlocking with the right passphrase brings everything back', async () => {
    const backend = setup()
    await initVault()
    fill()
    const before = snapshot()
    await createVault(PASS)
    await lockVault()

    configureVault(new Vault(backend, { iterations: 1000 }))
    await initVault()
    expect(useVaultStatus.getState().status).toBe('locked')
    expect(await unlockVault(PASS)).toEqual({ ok: true })
    expect(useVaultStatus.getState().status).toBe('unlocked')
    expect(snapshot()).toBe(before)
  })

  it('saves changes made while unlocked, so they survive locking', async () => {
    setup()
    await initVault()
    await createVault(PASS)
    useContacts.getState().add('Bo', A)
    await lockVault()
    expect(useContacts.getState().contacts).toEqual([])
    await unlockVault(PASS)
    expect(useContacts.getState().contacts.map((c) => c.name)).toEqual(['Bo'])
  })

  it('refuses a weak passphrase, a second vault, and a wrong passphrase, and stays locked', async () => {
    setup()
    await initVault()
    expect(await createVault('short')).toEqual({ ok: false, reason: 'weak-passphrase' })
    expect(useVaultStatus.getState().status).toBe('none')
    await createVault(PASS)
    expect(await createVault(PASS)).toEqual({ ok: false, reason: 'exists' })
    await lockVault()
    expect(await unlockVault('not the passphrase')).toEqual({
      ok: false,
      reason: 'wrong-passphrase',
    })
    expect(useVaultStatus.getState().status).toBe('locked')
    expect(useContacts.getState().contacts).toEqual([])
  })

  it('pauses after five wrong passphrases, and stops pausing after the time', async () => {
    setup()
    await initVault()
    await createVault(PASS)
    await lockVault()
    let now = 1_000_000
    for (let i = 1; i < MAX_UNLOCK_FAILURES; i++)
      expect(await unlockVault('nope nope nope', () => now)).toEqual({
        ok: false,
        reason: 'wrong-passphrase',
      })
    expect(await unlockVault('nope nope nope', () => now)).toEqual({
      ok: false,
      reason: 'cooling-down',
      retryInMs: UNLOCK_COOLDOWN_MS,
    })
    // Even the right passphrase is refused while pausing.
    expect(await unlockVault(PASS, () => now + 1000)).toMatchObject({
      ok: false,
      reason: 'cooling-down',
    })
    expect(useVaultStatus.getState().status).toBe('locked')
    now += UNLOCK_COOLDOWN_MS + 1
    expect(await unlockVault(PASS, () => now)).toEqual({ ok: true })
  })

  it('stays locked and shows nothing if the saved data is damaged', async () => {
    const backend = setup()
    await initVault()
    fill()
    await createVault(PASS)
    await lockVault()
    const record = backend.records.get('contacts.v1') ?? new Uint8Array()
    const damaged = record.slice()
    damaged[20] = (damaged[20] ?? 0) ^ 1
    await backend.putRecord('contacts.v1', damaged)
    const result = await unlockVault(PASS)
    expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(useVaultStatus.getState().status).toBe('locked')
    expect(usePots.getState().pots).toEqual([])
    expect(useContacts.getState().contacts).toEqual([])
  })

  it('changes the passphrase, saved data intact', async () => {
    const backend = setup()
    await initVault()
    fill()
    const before = snapshot()
    await createVault(PASS)
    expect(await changeVaultPassphrase('wrong wrong wrong', 'a brand new passphrase')).toEqual({
      ok: false,
      reason: 'wrong-passphrase',
    })
    expect(await changeVaultPassphrase(PASS, 'short')).toEqual({
      ok: false,
      reason: 'weak-passphrase',
    })
    expect(await changeVaultPassphrase(PASS, 'a brand new passphrase')).toEqual({ ok: true })
    await lockVault()
    configureVault(new Vault(backend, { iterations: 1000 }))
    await initVault()
    expect(await unlockVault(PASS)).toEqual({ ok: false, reason: 'wrong-passphrase' })
    expect(await unlockVault('a brand new passphrase')).toEqual({ ok: true })
    expect(snapshot()).toBe(before)
  })

  it('checks a passphrase again without unlocking, and wiping returns to having none', async () => {
    const backend = setup()
    await initVault()
    await createVault(PASS)
    expect(await verifyVaultPassphrase(PASS)).toBe(true)
    expect(await verifyVaultPassphrase('nope nope nope')).toBe(false)
    await wipeVault()
    expect(useVaultStatus.getState().status).toBe('none')
    expect(backend.records.size).toBe(0)
    expect(await createVault(PASS)).toEqual({ ok: true })
  })

  it('reports unavailable when storage cannot be read', async () => {
    const backend = createMemoryBackend()
    backend.getMeta = () => Promise.reject(new Error('blocked'))
    configureVault(new Vault(backend, { iterations: 1000 }))
    await initVault()
    expect(useVaultStatus.getState().status).toBe('unavailable')
  })

  it('does nothing when locking a vault that is not unlocked', async () => {
    setup()
    await initVault()
    await lockVault()
    expect(useVaultStatus.getState().status).toBe('none')
  })
})
