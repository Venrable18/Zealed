import type { LegacyWalletPort, SweepResult } from './walletPort.ts'

/**
 * TEST DOUBLES. In-memory stand-ins for the real wallet, used only by tests. They move no money and
 * are never imported by app code.
 *
 * With no arguments a `FakeLegacyWallet` is a single wallet that receives what it sends, which is
 * enough for the one-person flows. Give several wallets the same `FakeNetwork` to act as different
 * people (owner, guardians, heir): memos then arrive in the inbox of the address they were sent to.
 */
export class FakeNetwork {
  readonly inboxes = new Map<string, Uint8Array[]>()
  readonly gifts = new Map<string, bigint>()
  giftCount = 0

  deliver(to: string, memos: Uint8Array[]): void {
    this.inboxes.set(to, [...(this.inboxes.get(to) ?? []), ...memos])
  }
}

export class FakeLegacyWallet implements LegacyWalletPort {
  readonly network: FakeNetwork
  readonly address: string
  /** Every memo this wallet sent, in order. */
  readonly delivered: Uint8Array[] = []
  /** Memos grouped by the address they were sent to. */
  readonly sentTo = new Map<string, Uint8Array[]>()
  readonly funded: { address: string; zat: bigint }[] = []
  readonly swept: string[] = []
  /** Order of wallet calls, to check funding happens before delivery. */
  readonly events: string[] = []
  private readonly loopback: boolean
  fee = 25_000n
  failNext: 'gift' | 'fund' | 'send' | 'sweep' | undefined
  sweepResult: SweepResult | undefined

  constructor(options: { address?: string; network?: FakeNetwork } = {}) {
    this.loopback = options.network === undefined
    this.network = options.network ?? new FakeNetwork()
    this.address = options.address ?? 'utestowneraddressowneraddressowner'
  }

  get gifts(): Map<string, bigint> {
    return this.network.gifts
  }

  ownAddress(): Promise<string> {
    return Promise.resolve(this.address)
  }

  estimateFee(): Promise<bigint> {
    return Promise.resolve(this.fee)
  }

  createGiftWallet(): Promise<{ seed: string; address: string }> {
    if (this.failNext === 'gift') return Promise.reject(new Error('boom'))
    this.events.push('gift')
    this.network.giftCount++
    const n = this.network.giftCount
    return Promise.resolve({
      seed: `seed words ${String(n)}`,
      address: `utestgiftaddress${String(n).padStart(12, '0')}`,
    })
  }

  fundGiftWallet(address: string, zat: bigint): Promise<void> {
    if (this.failNext === 'fund') return Promise.reject(new Error('boom'))
    this.events.push('fund')
    this.funded.push({ address, zat })
    this.network.gifts.set(`seed words ${String(Number(address.slice(-12)))}`, zat)
    return Promise.resolve()
  }

  sendMemos(args: { to: string; memos: Uint8Array[] }): Promise<{ txid: string }> {
    if (this.failNext === 'send') {
      this.failNext = undefined
      return Promise.reject(new Error('boom'))
    }
    this.events.push('send')
    this.delivered.push(...args.memos)
    this.sentTo.set(args.to, [...(this.sentTo.get(args.to) ?? []), ...args.memos])
    if (!this.loopback) this.network.deliver(args.to, args.memos)
    return Promise.resolve({ txid: 'tx-1' })
  }

  receivedMemos(): Promise<Uint8Array[]> {
    return Promise.resolve(
      this.loopback ? [...this.delivered] : [...(this.network.inboxes.get(this.address) ?? [])],
    )
  }

  sweepGiftWallet(seed: string): Promise<SweepResult> {
    if (this.failNext === 'sweep') return Promise.reject(new Error('boom'))
    if (this.sweepResult !== undefined) return Promise.resolve(this.sweepResult)
    const zat = this.network.gifts.get(seed)
    if (zat === undefined) return Promise.resolve({ ok: false, reason: 'nothing-to-sweep' })
    this.network.gifts.delete(seed)
    this.swept.push(seed)
    return Promise.resolve({ ok: true, sweptZat: zat - this.fee, txid: 'sweep-1' })
  }
}
