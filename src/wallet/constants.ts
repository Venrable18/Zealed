/** Where testnet's NU7 began. A restore with no known birthday starts here: nothing earlier can matter. */
export const NU7_TESTNET_ACTIVATION = 4_465_026
/** Confirmations before received money can be spent: from a transaction we made, and from others. */
export const CONFIRMATIONS_TRUSTED = 2
export const CONFIRMATIONS_UNTRUSTED = 3
/** ZIP 317: each logical action costs this much, and every transaction pays for at least two. */
export const MARGINAL_FEE_ZAT = 5_000n
