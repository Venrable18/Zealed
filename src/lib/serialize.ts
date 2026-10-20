/**
 * JSON that can also carry bigint and bytes, which plain JSON cannot. Used to save app data inside
 * the encrypted vault and, in tests, to move values between a page and a simulated chain.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  // In chunks, so a large array does not overflow the argument limit.
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}

export function serialize(value: unknown): string {
  // JSON has no "nothing", so undefined at the top level is saved as null.
  return JSON.stringify(value ?? null, (_key, v: unknown) => {
    if (typeof v === 'bigint') return { $bigint: v.toString() }
    if (v instanceof Uint8Array) return { $bytes: bytesToBase64(v) }
    return v
  })
}

/** Reads text written by `serialize`. Throws SyntaxError for anything that is not valid JSON. */
export function deserialize(text: string): unknown {
  return JSON.parse(text, (_key, v: unknown) => {
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>
      if (typeof o['$bigint'] === 'string' && /^-?\d+$/.test(o['$bigint']))
        return BigInt(o['$bigint'])
      if (typeof o['$bytes'] === 'string')
        return Uint8Array.from(atob(o['$bytes']), (c) => c.charCodeAt(0))
    }
    return v
  })
}
