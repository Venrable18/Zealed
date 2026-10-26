import type { ByIndex, SigningRequest } from './port.ts'

export interface Member {
  /** 1-based. The host is 1. */
  index: number
  address: string
}

export type SharedPotStatus =
  /** A co-host has been invited and has not answered. */
  | 'invited'
  /** Keys are being made; every co-host must take part. */
  | 'keygen'
  | 'ready'
  | 'declined'
  | 'failed'

export type WithdrawalStatus =
  /** Host: waiting for enough co-hosts to approve. Co-host: waiting for this co-host to decide. */
  | 'pending'
  /** Co-host: approved, waiting for the host. Host: signatures being collected. */
  | 'approved'
  | 'signing'
  | 'signed'
  | 'sent'
  | 'declined'
  | 'failed'

export interface Withdrawal {
  id: string
  /** The checked transaction co-hosts sign (hex), and what it does. */
  signerPczt: string
  request: SigningRequest
  status: WithdrawalStatus
  /** Host only: the full unsigned transaction (hex). */
  fullPczt?: string
  /** Host: each co-host's commitments, per spend index. */
  commitments: Record<number, ByIndex>
  /** This co-host's secret nonces, per spend index. Secret. */
  nonces?: ByIndex
  /** Host: who signs this time. */
  signers?: number[]
  /** Host: the signing package per spend index. Signer: the packages received. */
  packages?: ByIndex
  /** Host: each signer's shares, per spend index. */
  shares: Record<number, ByIndex>
  declinedBy: number[]
  createdAtMs: number
}

export interface SharedPot {
  /** Random, 32 hex characters. Known only to the co-hosts: messages for a pot carry it. */
  id: string
  name: string
  role: 'host' | 'cohost'
  me: number
  /** How many co-hosts must approve a withdrawal. */
  threshold: number
  members: Member[]
  /** The seed of the pot's viewing key (hex). Every co-host has it. */
  viewingSeed: string
  status: SharedPotStatus
  declinedBy: number[]
  /** Key generation state. `secret1` and `secret2` are secret. */
  secret1?: string
  secret2?: string
  round1: ByIndex
  round2: ByIndex
  sentRound2?: boolean
  /** The co-host's key share. Secret. */
  keyPackage?: string
  publicKeyPackage?: string
  ufvk?: string
  accountId?: string
  address?: string
  withdrawals: Withdrawal[]
  createdAtMs: number
  /** Host only: what the app needs to make the pot once the key exists (its name, dates and so on). */
  details?: Record<string, unknown>
}
