/**
 * What shared pots need from the wallet. The real wallet provides it with FROST in WebAssembly;
 * tests provide a fake. Byte values are hex strings; maps are keyed by co-host number (1-based).
 */
export type ByIndex = Record<number, string>

export interface SigningRequest {
  /** What the co-hosts' signatures commit to. Each co-host computes it from the transaction. */
  sighash: string
  /** Each spend to sign: its action index and randomizer. */
  spends: { index: number; alpha: string }[]
  /** Where the money goes: every output with value, with its address when the transaction says. */
  outputs: { address?: string | undefined; zat?: string | undefined }[]
}

export interface SharedPotPort {
  ownAddress(): Promise<string>
  /** Every arbitrary-data memo the main account has received. */
  receivedMemos(): Promise<Uint8Array[]>
  /** One transaction carrying memos to several addresses. */
  sendMemosTo(batch: { to: string; memos: Uint8Array[] }[]): Promise<{ txid: string }>

  dkgPart1(me: number, max: number, min: number): Promise<{ secret: string; public: string }>
  dkgPart2(secret: string, round1: ByIndex): Promise<{ secret: string; packages: ByIndex }>
  /** Returns the key share (`secret`) and the group's public key package (`public`). */
  dkgPart3(
    secret: string,
    round1: ByIndex,
    round2: ByIndex,
  ): Promise<{ secret: string; public: string }>
  potUfvk(publicKeyPackage: string, viewingSeed: string): Promise<string>
  /** Adds the pot to the wallet as an account it can see but not spend from. */
  importPot(name: string, ufvk: string): Promise<{ accountId: string; address: string }>
  potSpendableZat(accountId: string): Promise<bigint>

  /** The unsigned withdrawal (PCZT bytes). */
  potWithdrawalPczt(accountId: string, to: string, zat: bigint): Promise<Uint8Array>
  /** The withdrawal as co-hosts receive it: enough to check and sign, nothing more. */
  pcztForSigners(pczt: Uint8Array): Promise<Uint8Array>
  /** `known`: addresses to name outputs by (a transaction only holds the shielded receiver). */
  signingRequest(pczt: Uint8Array, known: string[]): Promise<SigningRequest>
  /** Nonces (`secret`, kept) and commitments (`public`, sent) for one spend. */
  signRound1(keyPackage: string): Promise<{ secret: string; public: string }>
  signingPackage(commitments: ByIndex, sighash: string): Promise<string>
  /** Refuses a package that does not sign `sighash`. */
  signRound2(
    keyPackage: string,
    nonces: string,
    signingPackage: string,
    alpha: string,
    sighash: string,
  ): Promise<string>
  aggregate(
    signingPackage: string,
    shares: ByIndex,
    publicKeyPackage: string,
    alpha: string,
  ): Promise<string>
  applySignature(pczt: Uint8Array, index: number, signature: string): Promise<Uint8Array>
  proveAndSend(pczt: Uint8Array): Promise<void>
}
