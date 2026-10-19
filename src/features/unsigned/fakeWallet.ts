import { toMemos } from '../../zmp/index.ts'
import { encodeUnsigned, type UnsignedPayload } from './format.ts'
import type { ReceivedTx, UnsignedWalletPort } from './walletPort.ts'

/**
 * TEST DOUBLE. An in-memory stand-in for the real wallet, used only by tests. It moves no money and
 * is never imported by app code. `incoming` holds what "arrived" at each address.
 */
/** One counter for all fake wallets, so two wallets never hand out the same address. */
let addressCounter = 0

export class FakeUnsignedWallet implements UnsignedWalletPort {
  /** What has "arrived" at each address. Pass the same map to several wallets to let them talk. */
  readonly incoming: Map<string, ReceivedTx[]>
  readonly sent: { to: string; memos: Uint8Array[] }[] = []
  readonly payments: { to: string; zat: bigint; memos: Uint8Array[] }[] = []
  spendable = 100_000_000_000n
  now = 1_800_000_000_000
  fee = 20_000n
  addressCount = 0
  failNext: 'address' | 'read' | 'send' | 'balance' | undefined

  constructor(incoming = new Map<string, ReceivedTx[]>()) {
    this.incoming = incoming
  }

  newAddress(): Promise<string> {
    if (this.failNext === 'address') return Promise.reject(new Error('boom'))
    this.addressCount++
    addressCounter++
    return Promise.resolve(`utestcardaddress${String(addressCounter).padStart(20, '0')}`)
  }

  receivedTransactions(address: string): Promise<ReceivedTx[]> {
    if (this.failNext === 'read') return Promise.reject(new Error('boom'))
    return Promise.resolve([...(this.incoming.get(address) ?? [])])
  }

  estimateFee(): Promise<bigint> {
    return Promise.resolve(this.fee)
  }

  sendMemos(args: { to: string; memos: Uint8Array[] }): Promise<{ txid: string }> {
    if (this.failNext === 'send') return Promise.reject(new Error('boom'))
    this.sent.push(args)
    const txid = `reply-${String(this.sent.length)}`
    this.deliver(args.to, { txid, amountZat: 0n, memos: args.memos })
    return Promise.resolve({ txid })
  }

  spendableZat(): Promise<bigint> {
    if (this.failNext === 'balance') return Promise.reject(new Error('boom'))
    return Promise.resolve(this.spendable)
  }

  sendPayment(args: { to: string; zat: bigint; memos: Uint8Array[] }): Promise<{ txid: string }> {
    if (this.failNext === 'send') return Promise.reject(new Error('boom'))
    this.payments.push(args)
    const txid = `pay-${String(this.payments.length)}`
    this.deliver(args.to, { txid, amountZat: args.zat, memos: args.memos })
    return Promise.resolve({ txid })
  }

  private deliver(to: string, tx: { txid: string; amountZat: bigint; memos: Uint8Array[] }): void {
    this.now += 1000
    this.incoming.set(to, [...(this.incoming.get(to) ?? []), { ...tx, receivedAtMs: this.now }])
  }

  /** Makes a payment "arrive" at `address`, carrying the given message(s). */
  receive(
    address: string,
    tx: {
      txid: string
      receivedAtMs: number
      amountZat: bigint
      messages?: (UnsignedPayload | string)[]
      rawMemos?: Uint8Array[]
    },
  ): void {
    const memos = [
      ...(tx.messages ?? []).flatMap((m) =>
        toMemos('UNSIGNED_MSG', encodeUnsigned(typeof m === 'string' ? { body: m } : m)),
      ),
      ...(tx.rawMemos ?? []),
    ]
    this.incoming.set(address, [
      ...(this.incoming.get(address) ?? []),
      { txid: tx.txid, receivedAtMs: tx.receivedAtMs, amountZat: tx.amountZat, memos },
    ])
  }
}
