import { describe, expect, it } from 'vitest'
import { checkEndpoint, decodeLightdInfo, parseGrpcWebFrames } from './lightwalletd.ts'

const enc = new TextEncoder()
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => Array.from(p)))
const str = (field: number, text: string) =>
  concat(Uint8Array.of((field << 3) | 2, enc.encode(text).length), enc.encode(text))
const num = (field: number, value: number) => {
  const bytes: number[] = [(field << 3) | 0]
  let v = value
  while (v >= 0x80) {
    bytes.push((v % 0x80) | 0x80)
    v = Math.floor(v / 0x80)
  }
  bytes.push(v)
  return Uint8Array.from(bytes)
}
const frame = (flag: number, payload: Uint8Array) =>
  concat(Uint8Array.of(flag, 0, 0, (payload.length >> 8) & 0xff, payload.length & 0xff), payload)

const message = concat(
  str(1, 'v0.5.4'),
  str(2, 'ECC LightWalletD'),
  num(3, 1),
  str(4, 'test'),
  num(5, 280000),
  str(6, '77190ad9'),
  num(7, 4_475_856),
  num(12, 4_475_856),
)
const okBody = concat(
  frame(0, message),
  frame(0x80, enc.encode('grpc-status:0\r\ngrpc-message:\r\n')),
)

function fakeFetch(
  body: Uint8Array,
  init: { status?: number; headers?: Record<string, string> } = {},
): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(new Uint8Array(body), {
        status: init.status ?? 200,
        headers: init.headers ?? {},
      }),
    )
}

describe('decodeLightdInfo', () => {
  it('reads the fields we need and skips the rest', () => {
    expect(decodeLightdInfo(message)).toEqual({
      version: 'v0.5.4',
      vendor: 'ECC LightWalletD',
      chainName: 'test',
      consensusBranchId: '77190ad9',
      blockHeight: 4_475_856,
      estimatedHeight: 4_475_856,
    })
  })

  it('rejects truncated or malformed messages, and never throws', () => {
    expect(decodeLightdInfo(message.slice(0, message.length - 3))).toBeNull()
    expect(decodeLightdInfo(Uint8Array.of(0x0a, 0x7f, 1, 2))).toBeNull()
    expect(decodeLightdInfo(Uint8Array.of(0xff, 0xff, 0xff))).toBeNull()
    expect(decodeLightdInfo(new Uint8Array(0))).toEqual({
      version: '',
      vendor: '',
      chainName: '',
      consensusBranchId: '',
      blockHeight: 0,
      estimatedHeight: 0,
    })
    let a = 3
    const next = () => ((a = (a * 1664525 + 1013904223) | 0) >>> 0) / 4294967296
    for (let i = 0; i < 3000; i++) {
      const junk = Uint8Array.from({ length: Math.floor(next() * 80) }, () =>
        Math.floor(next() * 256),
      )
      expect(() => decodeLightdInfo(junk)).not.toThrow()
    }
  })
})

describe('parseGrpcWebFrames', () => {
  it('splits data frames from the trailer', () => {
    const reply = parseGrpcWebFrames(okBody)
    expect(reply?.messages).toHaveLength(1)
    expect(reply?.trailers).toContain('grpc-status:0')
  })

  it('rejects frames that run past the end', () => {
    expect(parseGrpcWebFrames(okBody.slice(0, 10))).toBeNull()
    expect(parseGrpcWebFrames(Uint8Array.of(0, 0, 0))).toBeNull()
    expect(parseGrpcWebFrames(new Uint8Array(0))).toEqual({ messages: [], trailers: '' })
  })
})

describe('checkEndpoint', () => {
  it('reports a healthy testnet server with its height and latency', async () => {
    let t = 100
    const result = await checkEndpoint('https://example.test/testnet/', {
      fetch: fakeFetch(okBody),
      now: () => (t += 42),
    })
    expect(result).toMatchObject({
      ok: true,
      latencyMs: 42,
      info: { chainName: 'test', blockHeight: 4_475_856, consensusBranchId: '77190ad9' },
    })
  })

  it('sends an empty gRPC-web request with nothing identifying, to the right URL', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const spy: typeof fetch = (input, init) => {
      seen = { url: input instanceof Request ? input.url : input.toString(), init: init ?? {} }
      return Promise.resolve(new Response(new Uint8Array(okBody)))
    }
    await checkEndpoint('https://example.test/testnet/', { fetch: spy })
    expect(seen?.url).toBe(
      'https://example.test/testnet/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo',
    )
    expect(seen?.init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
    expect(Array.from(seen?.init.body as Uint8Array)).toEqual([0, 0, 0, 0, 0])
    expect(seen?.init.headers).toEqual({
      'content-type': 'application/grpc-web+proto',
      'x-grpc-web': '1',
    })
  })

  it('says wrong network for a mainnet server', async () => {
    const mainnet = concat(
      frame(0, concat(str(4, 'main'), num(7, 1))),
      frame(0x80, enc.encode('grpc-status:0')),
    )
    expect(await checkEndpoint('https://x.test', { fetch: fakeFetch(mainnet) })).toEqual({
      ok: false,
      reason: 'wrong-network',
    })
  })

  it('treats HTTP errors, gRPC errors and garbage as a bad response', async () => {
    expect(
      await checkEndpoint('https://x.test', { fetch: fakeFetch(okBody, { status: 503 }) }),
    ).toEqual({ ok: false, reason: 'bad-response' })
    const grpcError = concat(frame(0x80, enc.encode('grpc-status:14\r\ngrpc-message:unavailable')))
    expect(await checkEndpoint('https://x.test', { fetch: fakeFetch(grpcError) })).toEqual({
      ok: false,
      reason: 'bad-response',
    })
    expect(
      await checkEndpoint('https://x.test', { fetch: fakeFetch(enc.encode('<html>hello</html>')) }),
    ).toEqual({ ok: false, reason: 'bad-response' })
    expect(await checkEndpoint('https://x.test', { fetch: fakeFetch(new Uint8Array(0)) })).toEqual({
      ok: false,
      reason: 'bad-response',
    })
  })

  it('reports an unreachable server and a timeout', async () => {
    expect(
      await checkEndpoint('https://x.test', {
        fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      }),
    ).toEqual({ ok: false, reason: 'unreachable' })
    const hang: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    expect(await checkEndpoint('https://x.test', { fetch: hang, timeoutMs: 20 })).toEqual({
      ok: false,
      reason: 'timeout',
    })
  })
})
