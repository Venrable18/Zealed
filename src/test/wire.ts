/**
 * TEST SUPPORT. Moves values (including bigint and bytes, which JSON cannot carry) between the
 * browser page and the simulated chain in Node. Never imported by app code.
 */
export function encodeWire(value: unknown): string {
  // JSON has no "nothing", so a call that returns nothing is sent as null.
  return JSON.stringify(value ?? null, (_key, v: unknown) => {
    if (typeof v === 'bigint') return { $bigint: v.toString() }
    if (v instanceof Uint8Array) return { $bytes: btoa(String.fromCharCode(...v)) }
    return v
  })
}

export function decodeWire(text: string): unknown {
  return JSON.parse(text, (_key, v: unknown) => {
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>
      if (typeof o['$bigint'] === 'string') return BigInt(o['$bigint'])
      if (typeof o['$bytes'] === 'string')
        return Uint8Array.from(atob(o['$bytes']), (c) => c.charCodeAt(0))
    }
    return v
  })
}
