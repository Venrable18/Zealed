/**
 * The part of the WebAssembly wallet (wallet/pkg, built from wallet/crates) that Zealed uses. It is
 * written out here, rather than imported, so the app type-checks and its tests run without having
 * built the WebAssembly first. The shapes match the generated `webzjs_wallet.d.ts`.
 */
export interface WasmWallet {
  create_account(
    name: string,
    seedPhrase: string,
    hdIndex: number,
    birthdayHeight?: number | null,
  ): Promise<number>
  sync(): Promise<void>
  get_wallet_summary(): Promise<WasmWalletSummary | undefined>
  get_current_address(accountId: number): Promise<string>
  new_address(accountId: number): Promise<string>
  /** JSON, see `NoteRecord`. */
  received_notes(accountId: number, address?: string | null): Promise<string>
  /** `payments` is JSON: `[{ address, zat, memoHex? }]`. Resolves to the transaction ids. */
  send_payments(
    seedPhrase: string,
    hdIndex: number,
    accountId: number,
    payments: string,
  ): Promise<string[]>
  db_to_bytes(): Promise<Uint8Array>
  /** Adds an account the wallet can see but not spend from (a shared pot). */
  create_account_view_ufvk(
    name: string,
    ufvk: string,
    birthdayHeight?: number | null,
  ): Promise<number>
  pot_withdrawal_pczt(accountId: number, to: string, zat: bigint): Promise<Uint8Array>
  pczt_prove_and_send(pczt: Uint8Array): Promise<void>
  get_latest_block(): Promise<bigint>
  free(): void
}

export interface WasmWalletSummary {
  chain_tip_height: number
  fully_scanned_height: number
  /** `[accountId, balances][]` */
  readonly account_balances: unknown
  free(): void
}

export interface WasmBalances {
  sapling_balance: number | bigint
  orchard_balance: number | bigint
  ironwood_balance?: number | bigint
  unshielded_balance: number | bigint
  pending_change: number | bigint
  pending_spendable: number | bigint
}

export interface WasmModule {
  default: (input?: unknown) => Promise<unknown>
  initThreadPool: (threads: number) => Promise<unknown>
  generate_seed_phrase: () => string
  // Shared pots: FROST key generation and signing. Values are hex; maps are JSON by co-host number.
  frost_dkg_part1: (me: number, max: number, min: number) => string
  frost_dkg_part2: (secret: string, round1Json: string) => string
  frost_dkg_part3: (secret: string, round1Json: string, round2Json: string) => string
  frost_pot_ufvk: (network: string, publicKeyPackage: string, viewingSeed: string) => string
  frost_sign_round1: (keyPackage: string) => string
  frost_signing_package: (commitmentsJson: string, sighash: string) => string
  frost_sign_round2: (
    keyPackage: string,
    nonces: string,
    signingPackage: string,
    alpha: string,
    sighash: string,
  ) => string
  frost_aggregate: (
    signingPackage: string,
    sharesJson: string,
    publicKeyPackage: string,
    alpha: string,
  ) => string
  pczt_signing_request: (network: string, pczt: Uint8Array, knownAddressesJson: string) => string
  pczt_for_signers: (pczt: Uint8Array) => Uint8Array
  pczt_apply_signature: (pczt: Uint8Array, index: number, signature: string) => Uint8Array
  WebWallet: new (
    network: string,
    lightwalletdUrl: string,
    minConfirmationsTrusted: number,
    minConfirmationsUntrusted: number,
    dbBytes?: Uint8Array | null,
  ) => WasmWallet
}

/** A received shielded note as the wallet reports it. */
export interface NoteRecord {
  txid: string
  minedHeight: number | null
  /** Unix milliseconds of the block, if the server could be asked. */
  timeMs: number | null
  /** Zatoshis, as a decimal string. */
  zat: string
  /** The 512-byte memo in hex, when it is an arbitrary-data memo (first byte 0xFF). */
  memoHex: string | null
  /** If the wallet counts the note as spent: the spending transaction, its state and expiry. */
  spentIn?: string | null
}
