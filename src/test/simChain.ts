/**
 * TEST SUPPORT. A simulated Zcash network for multi-actor browser scenarios: wallets, addresses,
 * payments with memos, block times (the real clock), and a flat fee. It is NOT testnet and moves no
 * money; it exists so the real screens can be driven end to end while the real wallet is built.
 * Never imported by app code and never shipped.
 */
export interface SimNote {
  txid: string
  to: string
  atMs: number
  zat: bigint
  memos: Uint8Array[]
}

interface SimWallet {
  id: string
  main: string
  owned: Set<string>
  initialZat: bigint
  /** Value this wallet has sent, including fees. */
  spentZat: bigint
  /** When this wallet last spent, for the change-lock failure mode. */
  lastSpendMs: number
}

export const SIM_FEE = 10_000n
export const SIM_PASSPHRASE = 'hunter2'
export const SIM_SEED_WORDS = [
  'abandon',
  'ability',
  'able',
  'about',
  'above',
  'absent',
  'absorb',
  'abstract',
  'absurd',
  'abuse',
  'access',
  'accident',
]

export class SimChain {
  readonly notes: SimNote[] = []
  private readonly wallets = new Map<string, SimWallet>()
  private readonly sweptGifts = new Set<string>()
  private readonly giftAddresses = new Map<string, string>()
  private readonly now: () => number
  /** Failure mode: after a wallet spends, its change cannot be spent again for this long (like unconfirmed change). */
  changeLockMs = 0
  private txCount = 0
  private addressCount = 0
  private giftCount = 0

  constructor(now: () => number = () => Date.now()) {
    this.now = now
  }

  /** Creates a wallet with some starting funds, standing in for a faucet. */
  addWallet(id: string, initialZat: bigint): string {
    if (!/^[a-z0-9]+$/.test(id)) throw new Error('wallet id must be lowercase letters and digits')
    const main = this.newOwnedAddress(id)
    this.wallets.set(id, {
      id,
      main,
      owned: new Set([main]),
      initialZat,
      spentZat: 0n,
      lastSpendMs: 0,
    })
    return main
  }

  mainAddress(id: string): string {
    return this.wallet(id).main
  }

  private wallet(id: string): SimWallet {
    const wallet = this.wallets.get(id)
    if (wallet === undefined) throw new Error(`unknown wallet ${id}`)
    return wallet
  }

  private newOwnedAddress(id: string): string {
    this.addressCount++
    // Letters and digits only, 20 or more characters, like the address shape the app checks for.
    const address = `utest1${id}n${String(this.addressCount).padStart(8, '0')}`.padEnd(30, 'x')
    this.wallets.get(id)?.owned.add(address)
    return address
  }

  balanceZat(id: string): bigint {
    const wallet = this.wallet(id)
    const received = this.notes
      .filter((n) => wallet.owned.has(n.to))
      .reduce((sum, n) => sum + n.zat, 0n)
    return wallet.initialZat + received - wallet.spentZat
  }

  private record(to: string, zat: bigint, memos: Uint8Array[]): SimNote {
    this.txCount++
    const note = {
      txid: `tx${String(this.txCount).padStart(6, '0')}`,
      to,
      atMs: this.now(),
      zat,
      memos,
    }
    this.notes.push(note)
    return note
  }

  /** Adds funds to a wallet, standing in for the person getting more from a faucet. */
  topUp(id: string, zat: bigint): void {
    this.wallet(id).initialZat += zat
  }

  /** A payment from a wallet. Throws 'insufficient-funds' if it cannot afford the payment and fee. */
  send(id: string, to: string, zat: bigint, memos: Uint8Array[]): string {
    const wallet = this.wallet(id)
    if (this.balanceZat(id) < zat + SIM_FEE) throw new Error('insufficient-funds')
    wallet.spentZat += zat + SIM_FEE
    wallet.lastSpendMs = this.now()
    return this.record(to, zat, memos).txid
  }

  /** TEST HELPER: something arrives at an address from outside the app, such as junk or a forged message. */
  inject(to: string, memos: Uint8Array[], zat = 0n): void {
    this.record(to, zat, memos)
  }

  /** Total value that has arrived at an address, whoever it belongs to. */
  receivedAt(address: string): bigint {
    return this.notes.filter((n) => n.to === address).reduce((sum, n) => sum + n.zat, 0n)
  }

  /** Runs one wallet operation, the way the page's wallet client asks for it. */
  call(walletId: string, method: string, args: unknown[]): unknown {
    const wallet = this.wallet(walletId)
    const a = (args[0] ?? {}) as Record<string, unknown>
    switch (method) {
      case 'ownAddress':
        return wallet.main
      case 'newAddress':
        return this.newOwnedAddress(walletId)
      case 'estimateFee':
        return 2n * SIM_FEE
      case 'spendableZat':
        return this.balanceZat(walletId)
      case 'balance':
        return { spendableZat: this.balanceZat(walletId), pendingZat: 0n }
      case 'receivedMemos':
        return this.notes.filter((n) => wallet.owned.has(n.to)).flatMap((n) => n.memos)
      case 'receivedTransactions': {
        const address = args[0] as string
        if (!wallet.owned.has(address)) throw new Error('not your address')
        return this.notes
          .filter((n) => n.to === address)
          .map((n) => ({ txid: n.txid, receivedAtMs: n.atMs, amountZat: n.zat, memos: n.memos }))
      }
      case 'sendMemos':
        return { txid: this.send(walletId, a['to'] as string, 0n, a['memos'] as Uint8Array[]) }
      case 'sendPayment':
        return {
          txid: this.send(
            walletId,
            a['to'] as string,
            a['zat'] as bigint,
            a['memos'] as Uint8Array[],
          ),
        }
      case 'sendPiece': {
        if (this.changeLockMs > 0 && this.now() - wallet.lastSpendMs < this.changeLockMs)
          return { ok: false, reason: 'not-spendable-yet' }
        try {
          const memo = a['memo'] as Uint8Array | undefined
          return {
            ok: true,
            txid: this.send(
              walletId,
              a['address'] as string,
              a['zat'] as bigint,
              memo === undefined ? [] : [memo],
            ),
          }
        } catch {
          return { ok: false, reason: 'insufficient-funds' }
        }
      }
      case 'createPotAccount': {
        const address = this.newOwnedAddress(walletId)
        return { accountId: address, address }
      }
      case 'balanceAsOf':
        return this.notes
          .filter((n) => n.to === args[0] && n.atMs <= (args[1] as number))
          .reduce((sum, n) => sum + n.zat, 0n)
      case 'piecesAsOf':
        return this.notes.filter(
          (n) => n.to === args[0] && n.zat > 0n && n.atMs <= (args[1] as number),
        ).length
      case 'memosAsOf':
        return this.notes
          .filter((n) => n.to === args[0] && n.atMs <= (args[1] as number))
          .flatMap((n) => n.memos)
      case 'withdrawAll':
        return { txid: this.record(wallet.main, 0n, []).txid }
      case 'createGiftWallet': {
        this.giftCount++
        const seed = `gift seed words ${String(this.giftCount)}`
        const address = `utest1gift${String(this.giftCount).padStart(8, '0')}`.padEnd(30, 'x')
        this.giftAddresses.set(seed, address)
        return { seed, address }
      }
      case 'fundGiftWallet':
        this.send(walletId, args[0] as string, args[1] as bigint, [])
        return undefined
      case 'sweepGiftWallet': {
        const seed = args[0] as string
        const address = this.giftAddresses.get(seed)
        if (address === undefined || this.sweptGifts.has(seed))
          return { ok: false, reason: 'nothing-to-sweep' }
        const held = this.receivedAt(address)
        if (held <= SIM_FEE) return { ok: false, reason: 'nothing-to-sweep' }
        this.sweptGifts.add(seed)
        const note = this.record(wallet.main, held - SIM_FEE, [])
        return { ok: true, sweptZat: held - SIM_FEE, txid: note.txid }
      }
      case 'verifyPassphrase':
        return args[0] === SIM_PASSPHRASE
      case 'exportSeed':
        return [...SIM_SEED_WORDS]
      default:
        throw new Error(`unknown wallet method ${method}`)
    }
  }
}
