export type CryptoErrorCode =
  | 'invalid-input'
  | 'decrypt-failed'
  | 'not-yet'
  | 'unlock-failed'
  | 'insufficient-shares'
  | 'bad-share'
  | 'wrong-key'
  | 'bad-bundle'

/**
 * Every crypto failure. The message is a fixed phrase for the code, never built from keys,
 * plaintext, memo contents or other secrets, so it is safe to show or report.
 */
export class CryptoError extends Error {
  readonly code: CryptoErrorCode

  constructor(code: CryptoErrorCode) {
    super(code)
    this.name = 'CryptoError'
    this.code = code
  }
}
