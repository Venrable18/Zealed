import type { LegacyWalletPort, SweepResult } from './walletPort.ts'

/**
 * TEST DOUBLE. An in-memory stand-in for the real wallet, used only by tests. It moves no money
 * and is never imported by app code. One instance can act as both sender and recipient, so a
 * whole seal, deliver, open and sweep flow can be tested.
 */
export class FakeLegacyWallet implements LegacyWalletPort {
  readonly delivered: Uint8Array[] = []
  readonly funded: { address: string; zat: bigint }[] = []
  readonly gifts = new Map<string, bigint>()
  readonly swept: string[] = []
  /** Order of wallet calls, to check funding happens before delivery. */
  readonly events: string[] = []
  private giftCount = 0
  fee = 25_000n
  failNext: 'gift' | 'fund' | 'send' | 'sweep' | undefined
  sweepResult: SweepResult | undefined

  estimateFee(): Promise<bigint> {
    return Promise.resolve(this.fee)
  }

  createGiftWallet(): Promise<{ seed: string; address: string }> {
    if (this.failNext === 'gift') return Promise.reject(new Error('boom'))
    this.events.push('gift')
    this.giftCount++
    return Promise.resolve({
      seed: `seed words ${String(this.giftCount)}`,
      address: `utestgiftaddress${String(this.giftCount).padStart(12, '0')}`,
    })
  }

  fundGiftWallet(address: string, zat: bigint): Promise<void> {
    if (this.failNext === 'fund') return Promise.reject(new Error('boom'))
    this.events.push('fund')
    this.funded.push({ address, zat })
    const seedNumber = Number(address.slice(-12))
    this.gifts.set(`seed words ${String(seedNumber)}`, zat)
    return Promise.resolve()
  }

  sendMemos(args: { to: string; memos: Uint8Array[] }): Promise<{ txid: string }> {
    if (this.failNext === 'send') {
      this.failNext = undefined
      return Promise.reject(new Error('boom'))
    }
    this.events.push('send')
    this.delivered.push(...args.memos)
    return Promise.resolve({ txid: 'tx-1' })
  }

  receivedMemos(): Promise<Uint8Array[]> {
    return Promise.resolve([...this.delivered])
  }

  sweepGiftWallet(seed: string): Promise<SweepResult> {
    if (this.failNext === 'sweep') return Promise.reject(new Error('boom'))
    if (this.sweepResult !== undefined) return Promise.resolve(this.sweepResult)
    const zat = this.gifts.get(seed)
    if (zat === undefined) return Promise.resolve({ ok: false, reason: 'nothing-to-sweep' })
    this.gifts.delete(seed)
    this.swept.push(seed)
    return Promise.resolve({ ok: true, sweptZat: zat - this.fee, txid: 'sweep-1' })
  }
}
