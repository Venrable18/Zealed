import type { PotWalletPort } from '../features/blindpot/walletPort.ts'
import type {
  ContributorWalletPort,
  SendPieceResult,
} from '../features/blindpot/contributorWallet.ts'
import type { DashboardWalletPort } from '../features/dashboard/walletPort.ts'
import type { LegacyWalletPort, SweepResult } from '../features/legacy/walletPort.ts'
import type { ReceiveWalletPort } from '../features/receive/walletPort.ts'
import type { ByIndex, SharedPotPort, SigningRequest } from '../features/blindpot/shared/port.ts'
import type { SeedPort } from '../features/settings/seedPort.ts'
import type { ReceivedTx, UnsignedWalletPort } from '../features/unsigned/walletPort.ts'
import { verifyVaultPassphrase } from '../storage/vaultState.ts'
import { MARGINAL_FEE_ZAT, NU7_TESTNET_ACTIVATION } from './constants.ts'
import { useWalletData, type WalletAccount } from './walletData.ts'
import type { NoteRecord, WasmBalances, WasmModule, WasmWallet } from './wasmApi.ts'

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16))
const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** What the wallet reports about itself. See `RealWallet.diagnostics`. */
export interface WalletDiagnostics {
  chainTip: number | null
  scannedTo: number | null
  birthday: number | null
  mainAccountId: number
  /** The account numbers the saved database holds. The main account must be one of them. */
  databaseAccountIds: number[]
  mainInDatabase: boolean
  /** Every note the wallet has found for the main account, newest first. */
  notes: { minedHeight: number | null; zat: string; spentIn: string | null }[]
}

interface Balances {
  spendable: bigint
  pending: bigint
}

/** Memos are 512 bytes; the wallet takes them as hex, with shorter ones padded by the library. */
function memoHex(memo: Uint8Array): string {
  return bytesToHex(memo)
}

/**
 * The real wallet. One object that satisfies every wallet interface the screens use, on top of the
 * WebAssembly wallet (wallet/). Calls that change the wallet run one at a time, so two sends never
 * pick the same coins, and the database is saved to the vault after each.
 */
export class RealWallet
  implements
    PotWalletPort,
    ContributorWalletPort,
    LegacyWalletPort,
    UnsignedWalletPort,
    DashboardWalletPort,
    ReceiveWalletPort,
    SeedPort,
    SharedPotPort
{
  /** How long to wait between checks while change from an earlier send confirms. */
  static retryDelayMs = 15_000
  /** How long to wait for that, at most. */
  static maxWaitMs = 10 * 60_000

  private queue: Promise<unknown> = Promise.resolve()
  private running = 0
  private disposed = false
  private lastSync = 0

  private readonly wasm: WasmModule
  private readonly wallet: WasmWallet

  private constructor(wasm: WasmModule, wallet: WasmWallet) {
    this.wasm = wasm
    this.wallet = wallet
  }

  /** Opens the wallet from what the vault holds, making the main account the first time. */
  static async open(wasm: WasmModule, endpointUrl: string, confirmations: [number, number]) {
    const data = useWalletData.getState()
    if (data.seed === null) throw new Error('There is no wallet.')
    const wallet = new wasm.WebWallet(
      'test',
      endpointUrl,
      confirmations[0],
      confirmations[1],
      data.dbBytes,
    )
    const real = new RealWallet(wasm, wallet)
    if (!data.accounts.some((account) => account.kind === 'main')) {
      // A new wallet (birthday 0) starts a little behind the chain tip, since nothing can have been
      // sent to it before; a restore with no birthday has to start at the beginning of NU7.
      const isNew = data.birthday === 0
      const birthday = isNew
        ? Math.max(NU7_TESTNET_ACTIVATION, Number(await wallet.get_latest_block()) - 20)
        : (data.birthday ?? NU7_TESTNET_ACTIVATION)
      const id = await wallet.create_account('main', data.seed, 0, birthday)
      const address = await wallet.get_current_address(id)
      useWalletData.getState().set({
        birthday,
        accounts: [{ id, kind: 'main', label: 'Main', hdIndex: 0, address }],
      })
      await real.save()
    }
    return real
  }

  /**
   * Releases the wallet. A sync or send in progress holds it, and freeing it then throws ("attempted
   * to take ownership of Rust value while it was borrowed"), so it is freed once the queue is idle.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    void this.queue.then(() => {
      try {
        this.wallet.free()
      } catch {
        // Nothing left to release.
      }
    })
  }

  // --- plumbing -----------------------------------------------------------------------------

  /** Runs `task` after everything queued before it. A failure does not block what comes next. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('The wallet was closed.'))
    this.running++
    const run = this.queue.then(task, task).finally(() => {
      this.running--
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  /** True while the wallet is doing something (a sync, a send, a read). Locking waits for it. */
  get busy(): boolean {
    return this.running > 0
  }

  private get seed(): string {
    const seed = useWalletData.getState().seed
    if (seed === null) throw new Error('There is no wallet.')
    return seed
  }

  private account(kind: WalletAccount['kind'], id?: number): WalletAccount {
    const found = useWalletData.getState().accounts.find(
      (a) =>
        // A pot with co-hosts is an account of its own kind, read and shown like any other pot.
        (a.kind === kind || (kind === 'pot' && a.kind === 'shared')) &&
        (id === undefined || a.id === id),
    )
    if (found === undefined) throw new Error('That account does not exist.')
    return found
  }

  private get main(): WalletAccount {
    return this.account('main')
  }

  /** Saves the database to the vault (through the data store, which the vault watches). */
  async save(): Promise<void> {
    useWalletData.getState().set({ dbBytes: await this.wallet.db_to_bytes() })
  }

  /** Brings the wallet up to the chain tip. Several callers at once share one sync. */
  sync(): Promise<void> {
    return this.exclusive(async () => {
      await this.wallet.sync()
      this.lastSync = Date.now()
      await this.save()
    })
  }

  /** Syncs unless that was done in the last few seconds. */
  async fresh(maxAgeMs = 20_000): Promise<void> {
    if (Date.now() - this.lastSync > maxAgeMs) await this.sync()
  }

  /** Outside `exclusive`: only for use inside a task that already holds the queue. */
  private async chainTipNow(): Promise<number> {
    return Number(await this.wallet.get_latest_block())
  }

  /**
   * Every read of the wallet's database also waits its turn. While a sync or a send runs, the
   * database is held by a worker thread; a read from the page's main thread would block that
   * thread, and the worker needs the main thread to start its own helpers, so the page would hang.
   */
  private balances(accountId: number): Promise<Balances> {
    return this.exclusive(() => this.balancesNow(accountId))
  }

  private async balancesNow(accountId: number): Promise<Balances> {
    const summary = await this.wallet.get_wallet_summary()
    const rows = (summary?.account_balances ?? []) as [number, WasmBalances][]
    summary?.free()
    const row = rows.find(([id]) => id === accountId)?.[1]
    if (row === undefined) return { spendable: 0n, pending: 0n }
    return {
      spendable:
        BigInt(row.sapling_balance) +
        BigInt(row.orchard_balance) +
        BigInt(row.ironwood_balance ?? 0),
      pending: BigInt(row.pending_change) + BigInt(row.pending_spendable),
    }
  }

  private notes(accountId: number, address?: string): Promise<NoteRecord[]> {
    return this.exclusive(
      async () =>
        JSON.parse(await this.wallet.received_notes(accountId, address ?? null)) as NoteRecord[],
    )
  }

  /**
   * What the wallet has found, for troubleshooting a balance that looks wrong. Holds no secrets:
   * no phrase, no memos, only heights, amounts and the accounts the database knows about.
   */
  async diagnostics(): Promise<WalletDiagnostics> {
    const main = this.main
    return this.exclusive(async () => {
      const summary = await this.wallet.get_wallet_summary()
      const rows = (summary?.account_balances ?? []) as [number, WasmBalances][]
      const result: WalletDiagnostics = {
        chainTip: summary?.chain_tip_height ?? null,
        scannedTo: summary?.fully_scanned_height ?? null,
        birthday: useWalletData.getState().birthday,
        mainAccountId: main.id,
        databaseAccountIds: rows.map(([id]) => id),
        mainInDatabase: rows.some(([id]) => id === main.id),
        notes: [],
      }
      summary?.free()
      const notes = JSON.parse(await this.wallet.received_notes(main.id, null)) as NoteRecord[]
      result.notes = notes
        .map((note) => ({
          minedHeight: note.minedHeight,
          zat: note.zat,
          spentIn: note.spentIn ?? null,
        }))
        .sort(
          (a, b) =>
            (b.minedHeight ?? Number.MAX_SAFE_INTEGER) - (a.minedHeight ?? Number.MAX_SAFE_INTEGER),
        )
      return result
    })
  }

  /** Sends from an account of this wallet. Resolves to the transaction ids. */
  private send(
    account: WalletAccount,
    payments: { address: string; zat: bigint; memo?: Uint8Array | undefined }[],
  ): Promise<string[]> {
    const seed = account.giftSeed ?? this.seed
    const json = JSON.stringify(
      payments.map((p) => ({
        address: p.address,
        zat: p.zat.toString(),
        ...(p.memo === undefined ? {} : { memoHex: memoHex(p.memo) }),
      })),
    )
    return this.exclusive(async () => {
      const txids = await this.wallet.send_payments(seed, account.hdIndex, account.id, json)
      await this.save()
      return txids
    })
  }

  /**
   * Sends, and if the wallet has money that is only waiting for confirmations (change from the
   * previous send, for example), waits for it and tries again. A letter's gift is funded just
   * before the letter is sent, so the letter always has to wait for that change. The wallet counts
   * as busy the whole time, so it is not locked in the middle.
   */
  private async sendWhenSpendable(
    account: WalletAccount,
    payments: { address: string; zat: bigint; memo?: Uint8Array | undefined }[],
  ): Promise<string[]> {
    this.running++
    try {
      const deadline = Date.now() + RealWallet.maxWaitMs
      for (;;) {
        try {
          return await this.send(account, payments)
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error)
          if (!/InsufficientFunds|insufficient/i.test(text) || Date.now() > deadline) throw error
          const { pending } = await this.balances(account.id)
          if (pending <= 0n) throw error
          await new Promise((resolve) => setTimeout(resolve, RealWallet.retryDelayMs))
          await this.sync()
        }
      }
    } finally {
      this.running--
    }
  }

  // --- Receive, Unsigned, Dashboard -------------------------------------------------------------

  ownAddress = (): Promise<string> => Promise.resolve(this.main.address)

  newAddress = (): Promise<string> =>
    this.exclusive(async () => {
      const address = await this.wallet.new_address(this.main.id)
      await this.save()
      return address
    })

  /** The balance as of the last sync, without going to the network. */
  async localBalance(): Promise<{ spendableZat: bigint; pendingZat: bigint }> {
    const { spendable, pending } = await this.balances(this.main.id)
    return { spendableZat: spendable, pendingZat: pending }
  }

  async balance(): Promise<{ spendableZat: bigint; pendingZat: bigint }> {
    await this.fresh()
    return this.localBalance()
  }

  async spendableZat(): Promise<bigint> {
    await this.fresh(5_000)
    return (await this.balances(this.main.id)).spendable
  }

  /**
   * ZIP 317 charges 5,000 zatoshis per logical action, at least two. A send of `n` outputs has `n`
   * plus the change output; one more is added as a margin. The wallet works out the exact fee when
   * it builds the transaction, and this only decides whether to try.
   */
  estimateFee({
    memoCount,
    fundsZat,
  }: {
    memoCount: number
    fundsZat?: bigint | null | undefined
  }): Promise<bigint> {
    const outputs = memoCount + (fundsZat === null || fundsZat === undefined ? 0 : 1) + 1
    return Promise.resolve(MARGINAL_FEE_ZAT * BigInt(Math.max(2, outputs + 1)))
  }

  async sendMemos({ to, memos }: { to: string; memos: Uint8Array[] }): Promise<{ txid: string }> {
    await this.fresh(5_000)
    const txids = await this.sendWhenSpendable(
      this.main,
      memos.map((memo) => ({ address: to, zat: 0n, memo })),
    )
    return { txid: txids[0] ?? '' }
  }

  async sendPayment({
    to,
    zat,
    memos,
  }: {
    to: string
    zat: bigint
    memos: Uint8Array[]
  }): Promise<{ txid: string }> {
    await this.fresh(5_000)
    const [first, ...rest] = memos
    const txids = await this.sendWhenSpendable(this.main, [
      { address: to, zat, memo: first },
      ...rest.map((memo) => ({ address: to, zat: 0n, memo })),
    ])
    return { txid: txids[0] ?? '' }
  }

  async receivedMemos(): Promise<Uint8Array[]> {
    await this.fresh()
    return (await this.notes(this.main.id))
      .filter((note) => note.memoHex !== null)
      .map((note) => hexToBytes(note.memoHex ?? ''))
  }

  async receivedTransactions(address: string): Promise<ReceivedTx[]> {
    await this.fresh()
    const byTx = new Map<string, ReceivedTx>()
    for (const note of await this.notes(this.main.id, address)) {
      const entry = byTx.get(note.txid) ?? {
        txid: note.txid,
        receivedAtMs: note.timeMs ?? Date.now(),
        amountZat: 0n,
        memos: [],
      }
      entry.amountZat += BigInt(note.zat)
      if (note.memoHex !== null) entry.memos.push(hexToBytes(note.memoHex))
      byTx.set(note.txid, entry)
    }
    return [...byTx.values()]
  }

  // --- Blind Pot -------------------------------------------------------------------------------

  createPotAccount(label: string): Promise<{ accountId: string; address: string }> {
    return this.exclusive(async () => {
      const data = useWalletData.getState()
      const hdIndex =
        1 + Math.max(0, ...data.accounts.filter((a) => a.kind === 'pot').map((a) => a.hdIndex))
      // A pot only needs to see what arrives from now on.
      const birthday = Math.max(NU7_TESTNET_ACTIVATION, (await this.chainTipNow()) - 10)
      const id = await this.wallet.create_account(label, this.seed, hdIndex, birthday)
      const address = await this.wallet.get_current_address(id)
      useWalletData.getState().set({
        accounts: [
          ...useWalletData.getState().accounts,
          { id, kind: 'pot', label, hdIndex, address },
        ],
      })
      await this.save()
      return { accountId: String(id), address }
    })
  }

  private async potNotes(accountId: string, atMs: number): Promise<NoteRecord[]> {
    await this.fresh()
    const id = this.account('pot', Number(accountId)).id
    // A note not yet in a block has no time and is not counted.
    return (await this.notes(id)).filter((n) => n.timeMs !== null && n.timeMs <= atMs)
  }

  async balanceAsOf(accountId: string, atMs: number): Promise<bigint> {
    return (await this.potNotes(accountId, atMs)).reduce((sum, n) => sum + BigInt(n.zat), 0n)
  }

  async piecesAsOf(accountId: string, atMs: number): Promise<number> {
    return (await this.potNotes(accountId, atMs)).length
  }

  async memosAsOf(accountId: string, atMs: number): Promise<Uint8Array[]> {
    return (await this.potNotes(accountId, atMs))
      .filter((n) => n.memoHex !== null)
      .map((n) => hexToBytes(n.memoHex ?? ''))
  }

  async withdrawAll(accountId: string): Promise<{ txid: string }> {
    await this.fresh(5_000)
    const pot = this.account('pot', Number(accountId))
    const { spendable } = await this.balances(pot.id)
    const { txids } = await this.sendAll(pot, this.main.address, spendable)
    return { txid: txids[0] ?? '' }
  }

  /**
   * Sends everything an account has, less the fee. The fee depends on how many coins are spent, so
   * this tries a few amounts, each a little lower than the last, until the wallet accepts one.
   */
  private async sendAll(
    from: WalletAccount,
    to: string,
    spendable: bigint,
  ): Promise<{ txids: string[]; sentZat: bigint }> {
    if (spendable <= 0n) throw new Error('There is nothing to send.')
    let lastError: unknown
    for (let actions = 2; actions <= 12; actions++) {
      const zat = spendable - MARGINAL_FEE_ZAT * BigInt(actions)
      if (zat <= 0n) break
      try {
        return { txids: await this.sendWhenSpendable(from, [{ address: to, zat }]), sentZat: zat }
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('The money could not be moved.')
  }

  // --- a guest's gift --------------------------------------------------------------------------

  async sendPiece({
    address,
    zat,
    memo,
  }: {
    address: string
    zat: bigint
    memo?: Uint8Array | undefined
  }): Promise<SendPieceResult> {
    await this.fresh(5_000)
    try {
      const txids = await this.send(this.main, [{ address, zat, memo }])
      return { ok: true, txid: txids[0] ?? '' }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      if (/InsufficientFunds|insufficient/i.test(text)) {
        const { spendable, pending } = await this.balances(this.main.id)
        return pending > 0n && spendable < zat
          ? { ok: false, reason: 'not-spendable-yet' }
          : { ok: false, reason: 'insufficient-funds' }
      }
      return { ok: false, reason: 'failed' }
    }
  }

  // --- Legacy ----------------------------------------------------------------------------------

  createGiftWallet(): Promise<{ seed: string; address: string; birthday: number }> {
    return this.exclusive(async () => {
      const seed = this.wasm.generate_seed_phrase()
      // Nothing can have been sent to a wallet that did not exist yet, so it starts at the tip.
      const birthday = await this.chainTipNow()
      const id = await this.wallet.create_account('gift', seed, 0, birthday)
      const address = await this.wallet.get_current_address(id)
      useWalletData.getState().set({
        accounts: [
          ...useWalletData.getState().accounts,
          { id, kind: 'gift', label: 'Gift', hdIndex: 0, address, giftSeed: seed },
        ],
      })
      await this.save()
      return { seed, address, birthday }
    })
  }

  async fundGiftWallet(address: string, zat: bigint): Promise<void> {
    await this.fresh(5_000)
    await this.sendWhenSpendable(this.main, [{ address, zat }])
  }

  async sweepGiftWallet(seed: string, birthday?: number): Promise<SweepResult> {
    await this.fresh(5_000)
    let gift = useWalletData
      .getState()
      .accounts.find((a) => a.kind === 'gift' && a.giftSeed === seed)
    if (gift === undefined) {
      // Opened on another device: restore the gift wallet from its seed, from the block it was made
      // at (the letter carries it), or from the start of NU7 for a letter that does not say.
      const start = Math.max(NU7_TESTNET_ACTIVATION, birthday ?? 0)
      const created = await this.exclusive(async () => {
        const id = await this.wallet.create_account('gift', seed, 0, start)
        const address = await this.wallet.get_current_address(id)
        const account: WalletAccount = {
          id,
          kind: 'gift',
          label: 'Gift',
          hdIndex: 0,
          address,
          giftSeed: seed,
        }
        useWalletData.getState().set({ accounts: [...useWalletData.getState().accounts, account] })
        return account
      })
      gift = created
      await this.sync()
    }
    const { spendable, pending } = await this.balances(gift.id)
    if (spendable <= 0n) {
      return { ok: false, reason: pending > 0n ? 'not-ready' : 'nothing-to-sweep' }
    }
    try {
      // What arrives is the gift less the network fee, which is what the person is told.
      const { txids, sentZat } = await this.sendAll(gift, this.main.address, spendable)
      return { ok: true, sweptZat: sentZat, txid: txids[0] ?? '' }
    } catch {
      return { ok: false, reason: 'failed' }
    }
  }

  // --- Shared pots (FROST) -------------------------------------------------------------------

  /** One transaction carrying memos to several co-hosts, each memo a zero-value output. */
  async sendMemosTo(batch: { to: string; memos: Uint8Array[] }[]): Promise<{ txid: string }> {
    await this.fresh(5_000)
    const txids = await this.sendWhenSpendable(
      this.main,
      batch.flatMap(({ to, memos }) => memos.map((memo) => ({ address: to, zat: 0n, memo }))),
    )
    return { txid: txids[0] ?? '' }
  }

  private pair(json: string): { secret: string; public: string } {
    return JSON.parse(json) as { secret: string; public: string }
  }

  dkgPart1(me: number, max: number, min: number) {
    return Promise.resolve(this.pair(this.wasm.frost_dkg_part1(me, max, min)))
  }

  dkgPart2(secret: string, round1: ByIndex) {
    return Promise.resolve(
      JSON.parse(this.wasm.frost_dkg_part2(secret, JSON.stringify(round1))) as {
        secret: string
        packages: ByIndex
      },
    )
  }

  dkgPart3(secret: string, round1: ByIndex, round2: ByIndex) {
    return Promise.resolve(
      this.pair(this.wasm.frost_dkg_part3(secret, JSON.stringify(round1), JSON.stringify(round2))),
    )
  }

  potUfvk(publicKeyPackage: string, viewingSeed: string) {
    return Promise.resolve(this.wasm.frost_pot_ufvk('test', publicKeyPackage, viewingSeed))
  }

  importPot(name: string, ufvk: string): Promise<{ accountId: string; address: string }> {
    return this.exclusive(async () => {
      // Gifts can only arrive after the pot exists; a margin covers co-hosts finishing at different times.
      const birthday = Math.max(NU7_TESTNET_ACTIVATION, (await this.chainTipNow()) - 200)
      const id = await this.wallet.create_account_view_ufvk(name, ufvk, birthday)
      const address = await this.wallet.get_current_address(id)
      useWalletData.getState().set({
        accounts: [
          ...useWalletData.getState().accounts,
          { id, kind: 'shared', label: name, hdIndex: -1, address },
        ],
      })
      await this.save()
      return { accountId: String(id), address }
    })
  }

  async potSpendableZat(accountId: string): Promise<bigint> {
    await this.fresh()
    return (await this.balances(Number(accountId))).spendable
  }

  potWithdrawalPczt(accountId: string, to: string, zat: bigint): Promise<Uint8Array> {
    return this.exclusive(() => this.wallet.pot_withdrawal_pczt(Number(accountId), to, zat))
  }

  pcztForSigners(pczt: Uint8Array) {
    return Promise.resolve(this.wasm.pczt_for_signers(pczt))
  }

  signingRequest(pczt: Uint8Array, known: string[]) {
    return Promise.resolve(
      JSON.parse(
        this.wasm.pczt_signing_request('test', pczt, JSON.stringify(known)),
      ) as SigningRequest,
    )
  }

  signRound1(keyPackage: string) {
    return Promise.resolve(this.pair(this.wasm.frost_sign_round1(keyPackage)))
  }

  signingPackage(commitments: ByIndex, sighash: string) {
    return Promise.resolve(this.wasm.frost_signing_package(JSON.stringify(commitments), sighash))
  }

  signRound2(
    keyPackage: string,
    nonces: string,
    signingPackage: string,
    alpha: string,
    sighash: string,
  ) {
    return Promise.resolve(
      this.wasm.frost_sign_round2(keyPackage, nonces, signingPackage, alpha, sighash),
    )
  }

  aggregate(signingPackage: string, shares: ByIndex, publicKeyPackage: string, alpha: string) {
    return Promise.resolve(
      this.wasm.frost_aggregate(signingPackage, JSON.stringify(shares), publicKeyPackage, alpha),
    )
  }

  applySignature(pczt: Uint8Array, index: number, signature: string) {
    return Promise.resolve(this.wasm.pczt_apply_signature(pczt, index, signature))
  }

  proveAndSend(pczt: Uint8Array): Promise<void> {
    return this.exclusive(async () => {
      await this.wallet.pczt_prove_and_send(pczt)
      await this.save()
    })
  }

  // --- Settings --------------------------------------------------------------------------------

  verifyPassphrase = (passphrase: string): Promise<boolean> => verifyVaultPassphrase(passphrase)

  exportSeed = (): Promise<string[]> => Promise.resolve(this.seed.split(' '))
}
