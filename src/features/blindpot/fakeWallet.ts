import { encodeChunk, splitMessage } from '../../zmp/index.ts'
import type { PotWalletPort } from './walletPort.ts'

/**
 * TEST DOUBLE. An in-memory stand-in for the real wallet, used only by tests. It is not a
 * wallet, moves no money and is never imported by app code.
 */
export interface FakePayment {
  atMs: number
  zat: bigint
  /** Wish text carried in a ZMP WISH memo, if any. */
  wish?: string
}

export function wishMemo(text: string): Uint8Array {
  const chunk = splitMessage('WISH', new TextEncoder().encode(text))[0]
  if (chunk === undefined) throw new Error('no chunk')
  return encodeChunk(chunk)
}

export class FakeWallet implements PotWalletPort {
  readonly payments: FakePayment[] = []
  readonly calls: { method: string; atMs?: number }[] = []
  withdrawn = false
  failNext: 'create' | 'withdraw' | 'read' | undefined

  createPotAccount(): Promise<{ accountId: string; address: string }> {
    if (this.failNext === 'create') return Promise.reject(new Error('boom'))
    return Promise.resolve({
      accountId: 'acct-1',
      address: 'utest1fakeaddressfakeaddressfakeaddress',
    })
  }

  balanceAsOf(_accountId: string, atMs: number): Promise<bigint> {
    this.calls.push({ method: 'balanceAsOf', atMs })
    if (this.failNext === 'read') return Promise.reject(new Error('boom'))
    return Promise.resolve(
      this.payments.filter((p) => p.atMs <= atMs).reduce((sum, p) => sum + p.zat, 0n),
    )
  }

  piecesAsOf(_accountId: string, atMs: number): Promise<number> {
    this.calls.push({ method: 'piecesAsOf', atMs })
    return Promise.resolve(this.payments.filter((p) => p.atMs <= atMs).length)
  }

  memosAsOf(_accountId: string, atMs: number): Promise<Uint8Array[]> {
    this.calls.push({ method: 'memosAsOf', atMs })
    return Promise.resolve(
      this.payments
        .filter((p) => p.atMs <= atMs && p.wish !== undefined)
        .map((p) => wishMemo(p.wish ?? '')),
    )
  }

  withdrawAll(): Promise<{ txid: string }> {
    if (this.failNext === 'withdraw') return Promise.reject(new Error('boom'))
    this.withdrawn = true
    return Promise.resolve({ txid: 'tx-1' })
  }
}
