import type { DashboardWalletPort } from '../features/dashboard/walletPort.ts'
import type { PotWalletPort } from '../features/blindpot/walletPort.ts'
import type {
  ContributorWalletPort,
  SendPieceResult,
} from '../features/blindpot/contributorWallet.ts'
import type { LegacyWalletPort, SweepResult } from '../features/legacy/walletPort.ts'
import type { SeedPort } from '../features/settings/seedPort.ts'
import type { ReceivedTx, UnsignedWalletPort } from '../features/unsigned/walletPort.ts'
import { decodeWire, encodeWire } from './wire.ts'

declare global {
  interface Window {
    /** Provided by the Playwright test: runs a wallet operation on the simulated chain in Node. */
    simChain: (walletId: string, method: string, argsJson: string) => Promise<string>
    __simWalletId: string
  }
}

/**
 * TEST SUPPORT. The wallet the real screens get inside the multi-actor test harness: every call goes
 * to the simulated chain. One object satisfies every wallet interface the app defines, so a single
 * harness serves every feature. Never imported by app code and never shipped.
 */
export class SimWalletClient
  implements
    PotWalletPort,
    ContributorWalletPort,
    LegacyWalletPort,
    UnsignedWalletPort,
    DashboardWalletPort,
    SeedPort
{
  private readonly walletId: string

  constructor(walletId: string) {
    this.walletId = walletId
  }

  private async call<T>(method: string, ...args: unknown[]): Promise<T> {
    return decodeWire(await window.simChain(this.walletId, method, encodeWire(args))) as T
  }

  ownAddress = () => this.call<string>('ownAddress')
  newAddress = () => this.call<string>('newAddress')
  estimateFee = (args: { memoCount: number; fundsZat?: bigint | null | undefined }) =>
    this.call<bigint>('estimateFee', args)
  spendableZat = () => this.call<bigint>('spendableZat')
  balance = () => this.call<{ spendableZat: bigint; pendingZat: bigint }>('balance')
  receivedMemos = () => this.call<Uint8Array[]>('receivedMemos')
  receivedTransactions = (address: string) =>
    this.call<ReceivedTx[]>('receivedTransactions', address)
  sendMemos = (args: { to: string; memos: Uint8Array[] }) =>
    this.call<{ txid: string }>('sendMemos', args)
  sendPayment = (args: { to: string; zat: bigint; memos: Uint8Array[] }) =>
    this.call<{ txid: string }>('sendPayment', args)
  sendPiece = (args: { address: string; zat: bigint; memo?: Uint8Array }) =>
    this.call<SendPieceResult>('sendPiece', args)
  createPotAccount = (label: string) =>
    this.call<{ accountId: string; address: string }>('createPotAccount', label)
  balanceAsOf = (accountId: string, atMs: number) =>
    this.call<bigint>('balanceAsOf', accountId, atMs)
  piecesAsOf = (accountId: string, atMs: number) => this.call<number>('piecesAsOf', accountId, atMs)
  memosAsOf = (accountId: string, atMs: number) =>
    this.call<Uint8Array[]>('memosAsOf', accountId, atMs)
  withdrawAll = (accountId: string) => this.call<{ txid: string }>('withdrawAll', accountId)
  createGiftWallet = () => this.call<{ seed: string; address: string }>('createGiftWallet')
  fundGiftWallet = (address: string, zat: bigint) =>
    this.call<undefined>('fundGiftWallet', address, zat)
  sweepGiftWallet = (seed: string) => this.call<SweepResult>('sweepGiftWallet', seed)
  verifyPassphrase = (passphrase: string) => this.call<boolean>('verifyPassphrase', passphrase)
  exportSeed = () => this.call<string[]>('exportSeed')
}
