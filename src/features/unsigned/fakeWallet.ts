import { toMemos } from '../../zmp/index.ts'
import { encodeUnsigned, type UnsignedPayload } from './format.ts'
import type { ReceivedTx, UnsignedWalletPort } from './walletPort.ts'

/**
 * TEST DOUBLE. An in-memory stand-in for the real wallet, used only by tests. It moves no money and
 * is never imported by app code. `incoming` holds what "arrived" at each address.
 */
export class FakeUnsignedWallet implements UnsignedWalletPort {
  readonly incoming = new Map<string, ReceivedTx[]>()
  readonly sent: { to: string; memos: Uint8Array[] }[] = []
  fee = 20_000n
  addressCount = 0
  failNext: 'address' | 'read' | 'send' | undefined

  newAddress(): Promise<string> {
    if (this.failNext === 'address') return Promise.reject(new Error('boom'))
    this.addressCount++
    return Promise.resolve(`utestcardaddress${String(this.addressCount).padStart(20, '0')}`)
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
    return Promise.resolve({ txid: `reply-${String(this.sent.length)}` })
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
