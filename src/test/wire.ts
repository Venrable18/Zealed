import { deserialize, serialize } from '../lib/serialize.ts'

/**
 * TEST SUPPORT. Moves values (including bigint and bytes, which JSON cannot carry) between the
 * browser page and the simulated chain in Node. Never imported by app code.
 */
export const encodeWire = serialize
export const decodeWire = deserialize
