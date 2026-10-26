import { beforeEach, describe, expect, it } from 'vitest'
import { NU7_TESTNET_ACTIVATION } from './constants.ts'
import { RealWallet } from './realWallet.ts'
import { useWalletData, validWalletData } from './walletData.ts'
import type { NoteRecord, WasmModule, WasmWallet } from './wasmApi.ts'

const A = 'utest1adaaddressadaaddressadaaddress'
const memo = (text: string): Uint8Array => {
  const bytes = new Uint8Array(512)
  bytes[0] = 0xff
  bytes.set(new TextEncoder().encode(text), 1)
  return bytes
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

interface FakeState {
  accounts: { id: number; seed: string; hd: number; birthday: number | null }[]
  notes: Map<number, (NoteRecord & { to?: string })[]>
  balances: Map<number, { spendable: number; pending: number }>
  sends: {
    seed: string
    hd: number
    account: number
    payments: { address: string; zat: string; memoHex?: string }[]
  }[]
  failSendsBelow: bigint
  failWith: string
  syncs: number
}

function fake(): { module: WasmModule; state: FakeState } {
  const state: FakeState = {
    accounts: [],
    notes: new Map(),
    balances: new Map(),
    sends: [],
    failSendsBelow: 0n,
    failWith: '',
    syncs: 0,
  }
  const wallet: WasmWallet = {
    create_account: (_name, seed, hd, birthday) => {
      const id = state.accounts.length + 1
      state.accounts.push({ id, seed, hd, birthday: birthday ?? null })
      return Promise.resolve(id)
    },
    sync: () => {
      state.syncs++
      return Promise.resolve()
    },
    get_wallet_summary: () =>
      Promise.resolve({
        chain_tip_height: 5,
        fully_scanned_height: 5,
        account_balances: [...state.balances].map(([id, b]) => [
          id,
          {
            sapling_balance: 0,
            orchard_balance: 0,
            ironwood_balance: b.spendable,
            unshielded_balance: 0,
            pending_change: b.pending,
            pending_spendable: 0,
          },
        ]),
        free: () => undefined,
      }),
    get_current_address: (id) => Promise.resolve(`utest1account${String(id)}address`),
    new_address: (id) => Promise.resolve(`utest1fresh${String(id)}address`),
    received_notes: (id, address) =>
      Promise.resolve(
        JSON.stringify(
          (state.notes.get(id) ?? []).filter(
            (n) => address === null || address === undefined || n.to === address,
          ),
        ),
      ),
    send_payments: (seed, hd, account, json) => {
      const payments = JSON.parse(json) as FakeState['sends'][number]['payments']
      const total = payments.reduce((sum, p) => sum + BigInt(p.zat), 0n)
      if (state.failWith !== '') return Promise.reject(new Error(state.failWith))
      if (total >= state.failSendsBelow && state.failSendsBelow > 0n)
        return Promise.reject(new Error('could not propose the payments: InsufficientFunds'))
      state.sends.push({ seed, hd, account, payments })
      return Promise.resolve([`tx${String(state.sends.length)}`])
    },
    db_to_bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    create_account_view_ufvk: () => Promise.reject(new Error('not in this test')),
    pot_withdrawal_pczt: () => Promise.reject(new Error('not in this test')),
    pczt_prove_and_send: () => Promise.reject(new Error('not in this test')),
    get_latest_block: () => Promise.resolve(5_000_000n),
    free: () => undefined,
  }
  const module = {
    default: () => Promise.resolve(),
    initThreadPool: () => Promise.resolve(),
    generate_seed_phrase: () => 'gift seed words',
    ...Object.fromEntries(
      [
        'frost_dkg_part1',
        'frost_dkg_part2',
        'frost_dkg_part3',
        'frost_pot_ufvk',
        'frost_sign_round1',
        'frost_signing_package',
        'frost_sign_round2',
        'frost_aggregate',
        'pczt_signing_request',
        'pczt_for_signers',
        'pczt_apply_signature',
      ].map((name) => [
        name,
        () => {
          throw new Error('not in this test')
        },
      ]),
    ),
    WebWallet: function WebWallet() {
      return wallet
    } as unknown as WasmModule['WebWallet'],
  } as unknown as WasmModule
  return { module, state }
}

beforeEach(() => {
  useWalletData.getState().reset()
  useWalletData.getState().set({ seed: 'main seed words', birthday: 4_500_000 })
})

async function open() {
  const { module, state } = fake()
  const wallet = await RealWallet.open(module, 'https://example.test', [2, 3])
  return { wallet, state }
}

describe('opening', () => {
  it('makes the main account once, from the saved birthday, and saves the database', async () => {
    const { wallet, state } = await open()
    expect(state.accounts).toEqual([{ id: 1, seed: 'main seed words', hd: 0, birthday: 4_500_000 }])
    expect(useWalletData.getState().accounts).toMatchObject([{ id: 1, kind: 'main', hdIndex: 0 }])
    expect(useWalletData.getState().dbBytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(await wallet.ownAddress()).toBe('utest1account1address')
  })

  it('starts a brand-new wallet just behind the chain tip, not at the start of NU7', async () => {
    useWalletData.getState().set({ birthday: 0 })
    const { state } = await open()
    expect(state.accounts[0]?.birthday).toBe(5_000_000 - 20)
    expect(useWalletData.getState().birthday).toBe(5_000_000 - 20)
  })

  it('starts a restore with no known birthday at the start of NU7', async () => {
    useWalletData.getState().set({ birthday: null })
    const { state } = await open()
    expect(state.accounts[0]?.birthday).toBe(NU7_TESTNET_ACTIVATION)
  })

  it('does not make the account again when the database already has it', async () => {
    useWalletData.getState().set({
      accounts: [{ id: 1, kind: 'main', label: 'Main', hdIndex: 0, address: A }],
    })
    const { state } = await open()
    expect(state.accounts).toEqual([])
  })

  it('refuses to open with no wallet', async () => {
    useWalletData.getState().reset()
    await expect(RealWallet.open(fake().module, 'https://example.test', [2, 3])).rejects.toThrow()
  })
})

describe('sending', () => {
  it('sends several memos to one address in one transaction, each with no value', async () => {
    const { wallet, state } = await open()
    await wallet.sendMemos({ to: A, memos: [memo('one'), memo('two')] })
    expect(state.sends).toHaveLength(1)
    expect(state.sends[0]?.payments.map((p) => p.zat)).toEqual(['0', '0'])
    expect(state.sends[0]?.payments.map((p) => p.address)).toEqual([A, A])
    expect(state.sends[0]?.payments[0]?.memoHex).toBe(hex(memo('one')))
    expect(state.sends[0]).toMatchObject({ seed: 'main seed words', hd: 0, account: 1 })
  })

  it('attaches the first memo to the payment and the rest to value-less outputs', async () => {
    const { wallet, state } = await open()
    await wallet.sendPayment({ to: A, zat: 123_456n, memos: [memo('a'), memo('b')] })
    expect(state.sends[0]?.payments.map((p) => p.zat)).toEqual(['123456', '0'])
  })

  it('one send at a time, even when asked together', async () => {
    const { wallet, state } = await open()
    await Promise.all([
      wallet.sendMemos({ to: A, memos: [memo('1')] }),
      wallet.sendMemos({ to: A, memos: [memo('2')] }),
      wallet.sendMemos({ to: A, memos: [memo('3')] }),
    ])
    expect(state.sends.map((s) => s.payments[0]?.memoHex)).toEqual([
      hex(memo('1')),
      hex(memo('2')),
      hex(memo('3')),
    ])
  })

  it('a failed send does not stop the next one', async () => {
    const { wallet, state } = await open()
    state.failWith = 'boom'
    await expect(wallet.sendMemos({ to: A, memos: [memo('x')] })).rejects.toThrow('boom')
    state.failWith = ''
    await expect(wallet.sendMemos({ to: A, memos: [memo('y')] })).resolves.toMatchObject({
      txid: 'tx1',
    })
  })

  it('reports a gift piece that cannot be afforded as not spendable yet, or insufficient', async () => {
    const { wallet, state } = await open()
    state.failSendsBelow = 1n
    state.balances.set(1, { spendable: 0, pending: 5_000 })
    expect(await wallet.sendPiece({ address: A, zat: 100_000n })).toEqual({
      ok: false,
      reason: 'not-spendable-yet',
    })
    state.balances.set(1, { spendable: 0, pending: 0 })
    expect(await wallet.sendPiece({ address: A, zat: 100_000n })).toEqual({
      ok: false,
      reason: 'insufficient-funds',
    })
    state.failSendsBelow = 0n
    state.failWith = 'something else'
    expect(await wallet.sendPiece({ address: A, zat: 100_000n })).toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('estimates ZIP 317 fees: five thousand per action, at least two', async () => {
    const { wallet } = await open()
    expect(await wallet.estimateFee({ memoCount: 1 })).toBe(15_000n)
    expect(await wallet.estimateFee({ memoCount: 5, fundsZat: 1n })).toBe(40_000n)
  })
})

describe('waiting for change', () => {
  beforeEach(() => {
    RealWallet.retryDelayMs = 1
  })

  it('waits for pending change to confirm, then sends', async () => {
    const { wallet, state } = await open()
    state.balances.set(1, { spendable: 0, pending: 50_000 })
    state.failWith = 'could not propose the payments: InsufficientFunds'
    const sending = wallet.sendMemos({ to: A, memos: [memo('later')] })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(wallet.busy).toBe(true)
    state.failWith = ''
    await expect(sending).resolves.toMatchObject({ txid: 'tx1' })
    expect(state.syncs).toBeGreaterThan(0)
    expect(wallet.busy).toBe(false)
  })

  it('does not wait when nothing is pending: it is simply not enough', async () => {
    const { wallet, state } = await open()
    state.balances.set(1, { spendable: 0, pending: 0 })
    state.failWith = 'could not propose the payments: InsufficientFunds'
    await expect(wallet.sendMemos({ to: A, memos: [memo('x')] })).rejects.toThrow(/Insufficient/)
    expect(wallet.busy).toBe(false)
  })
})

describe('reading', () => {
  it('lists only arbitrary-data memos, as raw bytes', async () => {
    const { wallet, state } = await open()
    state.notes.set(1, [
      { txid: 'a', minedHeight: 1, timeMs: 1_000, zat: '1000', memoHex: hex(memo('hello')) },
      { txid: 'b', minedHeight: 2, timeMs: 2_000, zat: '2000', memoHex: null },
    ])
    const memos = await wallet.receivedMemos()
    expect(memos).toHaveLength(1)
    expect(memos[0]).toEqual(memo('hello'))
  })

  it('groups notes into transactions per address, with total, time and memos', async () => {
    const { wallet, state } = await open()
    state.notes.set(1, [
      { txid: 'a', minedHeight: 1, timeMs: 1_000, zat: '1000', memoHex: hex(memo('m1')), to: A },
      { txid: 'a', minedHeight: 1, timeMs: 1_000, zat: '500', memoHex: hex(memo('m2')), to: A },
      { txid: 'b', minedHeight: 2, timeMs: 2_000, zat: '7', memoHex: null, to: 'other' },
    ])
    const txs = await wallet.receivedTransactions(A)
    expect(txs).toHaveLength(1)
    expect(txs[0]).toMatchObject({ txid: 'a', receivedAtMs: 1_000, amountZat: 1_500n })
    expect(txs[0]?.memos).toEqual([memo('m1'), memo('m2')])
  })

  it('reads the balance from the wallet summary, counting Ironwood, and syncs first', async () => {
    const { wallet, state } = await open()
    state.balances.set(1, { spendable: 70_000, pending: 3_000 })
    expect(await wallet.balance()).toEqual({ spendableZat: 70_000n, pendingZat: 3_000n })
    expect(state.syncs).toBe(1)
    expect(await wallet.balance()).toEqual({ spendableZat: 70_000n, pendingZat: 3_000n })
    expect(state.syncs).toBe(1)
  })
})

describe('pots', () => {
  it('makes an account per pot, each with its own address, from the main seed', async () => {
    const { wallet, state } = await open()
    const one = await wallet.createPotAccount('Ada and Tunde')
    const two = await wallet.createPotAccount('Another')
    expect(one.address).not.toBe(two.address)
    expect(state.accounts.filter((a) => a.id > 1).map((a) => a.hd)).toEqual([1, 2])
    expect(state.accounts.every((a) => a.seed === 'main seed words')).toBe(true)
  })

  it('counts only what arrived by the given time, and only the pot’s own notes', async () => {
    const { wallet, state } = await open()
    const pot = await wallet.createPotAccount('P')
    state.notes.set(Number(pot.accountId), [
      { txid: 'a', minedHeight: 1, timeMs: 1_000, zat: '100', memoHex: hex(memo('wish')) },
      { txid: 'b', minedHeight: 2, timeMs: 5_000, zat: '200', memoHex: null },
      { txid: 'c', minedHeight: null, timeMs: null, zat: '999', memoHex: null },
    ])
    expect(await wallet.balanceAsOf(pot.accountId, 4_000)).toBe(100n)
    expect(await wallet.balanceAsOf(pot.accountId, 6_000)).toBe(300n)
    expect(await wallet.piecesAsOf(pot.accountId, 6_000)).toBe(2)
    expect(await wallet.memosAsOf(pot.accountId, 6_000)).toEqual([memo('wish')])
  })

  it('withdraws everything to the main address, less a fee it finds', async () => {
    const { wallet, state } = await open()
    const pot = await wallet.createPotAccount('P')
    state.balances.set(Number(pot.accountId), { spendable: 1_000_000, pending: 0 })
    // The wallet accepts a send only if it leaves at least three actions of fee.
    state.failSendsBelow = 1_000_000n - 14_999n
    await wallet.withdrawAll(pot.accountId)
    const sent = state.sends.at(-1)
    expect(sent?.payments[0]?.address).toBe('utest1account1address')
    expect(BigInt(sent?.payments[0]?.zat ?? '0')).toBe(1_000_000n - 15_000n)
    expect(sent?.hd).toBe(1)
  })

  it('refuses to withdraw nothing', async () => {
    const { wallet } = await open()
    const pot = await wallet.createPotAccount('P')
    await expect(wallet.withdrawAll(pot.accountId)).rejects.toThrow()
  })
})

describe('gift wallets', () => {
  it('makes a throwaway wallet whose seed is kept, funds it and sweeps it into the main account', async () => {
    const { wallet, state } = await open()
    const gift = await wallet.createGiftWallet()
    expect(gift.seed).toBe('gift seed words')
    await wallet.fundGiftWallet(gift.address, 50_000_000n)
    expect(state.sends.at(-1)?.payments[0]).toMatchObject({
      address: gift.address,
      zat: '50000000',
    })

    state.balances.set(2, { spendable: 50_000_000, pending: 0 })
    const swept = await wallet.sweepGiftWallet(gift.seed)
    // It reports what actually arrives: the gift less the fee.
    expect(swept).toMatchObject({ ok: true, sweptZat: 50_000_000n - 10_000n })
    // Signed with the gift wallet's own seed, to the main address.
    expect(state.sends.at(-1)).toMatchObject({ seed: 'gift seed words', account: 2 })
    expect(state.sends.at(-1)?.payments[0]?.address).toBe('utest1account1address')
  })

  it('restores a gift wallet it does not know from its seed, from the start of NU7', async () => {
    const { wallet, state } = await open()
    state.balances.set(2, { spendable: 0, pending: 0 })
    expect(await wallet.sweepGiftWallet('another seed')).toEqual({
      ok: false,
      reason: 'nothing-to-sweep',
    })
    expect(state.accounts[1]).toMatchObject({
      seed: 'another seed',
      birthday: NU7_TESTNET_ACTIVATION,
    })
  })

  it('says not ready while the gift is still waiting for confirmations', async () => {
    const { wallet, state } = await open()
    const gift = await wallet.createGiftWallet()
    state.balances.set(2, { spendable: 0, pending: 50_000 })
    expect(await wallet.sweepGiftWallet(gift.seed)).toEqual({ ok: false, reason: 'not-ready' })
  })
})

describe('seed', () => {
  it('exports the words', async () => {
    const { wallet } = await open()
    expect(await wallet.exportSeed()).toEqual(['main', 'seed', 'words'])
  })
})

describe('saved data', () => {
  it('accepts what it saved, and nothing else', () => {
    const data = {
      seed: 's',
      birthday: 3,
      accounts: [{ id: 1, kind: 'main', label: 'x', hdIndex: 0, address: A }],
      dbBytes: new Uint8Array([9]),
    }
    expect(validWalletData(data)).toEqual(data)
    expect(validWalletData(null)).toBeNull()
    expect(validWalletData({ seed: null, accounts: [] })).toBeNull()
    expect(validWalletData({ seed: 's', accounts: 5 })).toBeNull()
    expect(
      validWalletData({
        seed: 's',
        accounts: [{ id: 'x' }, { id: 1, kind: 'bad', address: A, hdIndex: 0 }],
      })?.accounts,
    ).toEqual([])
  })
})
