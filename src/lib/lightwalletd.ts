/**
 * A minimal gRPC-web client for one call: `GetLightdInfo`, used to check that a light-wallet server
 * is reachable and on the right network. It sends an empty request and reads a few fields from the
 * reply. No library is needed: the frame format and the protobuf fields involved are tiny.
 */

export interface LightdInfo {
  version: string
  vendor: string
  /** "main" or "test". */
  chainName: string
  /** The consensus branch ID as hex, e.g. "77190ad9" for NU7. */
  consensusBranchId: string
  blockHeight: number
  estimatedHeight: number
}

/** Reads the fields we need from a protobuf message. Unknown and malformed fields are skipped or end the read. */
export function decodeLightdInfo(bytes: Uint8Array): LightdInfo | null {
  const info: LightdInfo = {
    version: '',
    vendor: '',
    chainName: '',
    consensusBranchId: '',
    blockHeight: 0,
    estimatedHeight: 0,
  }
  let at = 0
  const varint = (): number | null => {
    let result = 0
    for (let shift = 0; shift < 49; shift += 7) {
      const byte = bytes[at++]
      if (byte === undefined) return null
      result += (byte & 0x7f) * 2 ** shift
      if ((byte & 0x80) === 0) return result
    }
    return null
  }
  const text = (
    field: 'version' | 'vendor' | 'chainName' | 'consensusBranchId',
    length: number,
  ) => {
    try {
      info[field] = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(at, at + length))
    } catch {
      /* ignore a field that is not valid text */
    }
  }

  while (at < bytes.length) {
    const key = varint()
    if (key === null) return null
    const field = Math.floor(key / 8)
    const wire = key % 8
    if (wire === 0) {
      const value = varint()
      if (value === null) return null
      if (field === 7) info.blockHeight = value
      if (field === 12) info.estimatedHeight = value
    } else if (wire === 2) {
      const length = varint()
      if (length === null || at + length > bytes.length) return null
      if (field === 1) text('version', length)
      else if (field === 2) text('vendor', length)
      else if (field === 4) text('chainName', length)
      else if (field === 6) text('consensusBranchId', length)
      at += length
    } else if (wire === 1) at += 8
    else if (wire === 5) at += 4
    else return null
  }
  return at === bytes.length ? info : null
}

export interface GrpcWebReply {
  /** Data frames, in order. */
  messages: Uint8Array[]
  /** Trailer text such as "grpc-status:0", or '' if none. */
  trailers: string
}

/** Splits a gRPC-web response body into data frames and the trailer frame. Returns null if malformed. */
export function parseGrpcWebFrames(body: Uint8Array): GrpcWebReply | null {
  const messages: Uint8Array[] = []
  let trailers = ''
  let at = 0
  while (at < body.length) {
    if (at + 5 > body.length) return null
    const flag = body[at] ?? 0
    const length = new DataView(body.buffer, body.byteOffset + at + 1, 4).getUint32(0)
    at += 5
    if (at + length > body.length) return null
    const frame = body.slice(at, at + length)
    at += length
    if ((flag & 0x80) === 0) messages.push(frame)
    else trailers = new TextDecoder().decode(frame)
  }
  return { messages, trailers }
}

export type EndpointHealth =
  | { ok: true; info: LightdInfo; latencyMs: number }
  | { ok: false; reason: 'unreachable' | 'timeout' | 'bad-response' | 'wrong-network' }

const EMPTY_REQUEST = new Uint8Array(5)

/**
 * Asks the server for its status. `expectedChain` is "test" for Zealed. The check never throws and
 * never sends anything about the user: the request body is empty.
 */
export async function checkEndpoint(
  baseUrl: string,
  options: {
    fetch?: typeof fetch
    timeoutMs?: number
    expectedChain?: string
    now?: () => number
  } = {},
): Promise<EndpointHealth> {
  const doFetch = options.fetch ?? fetch.bind(globalThis)
  const now = options.now ?? (() => performance.now())
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, options.timeoutMs ?? 8000)
  const started = now()
  try {
    const response = await doFetch(
      `${baseUrl.replace(/\/$/, '')}/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/grpc-web+proto', 'x-grpc-web': '1' },
        body: EMPTY_REQUEST,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      },
    )
    if (!response.ok) return { ok: false, reason: 'bad-response' }
    const reply = parseGrpcWebFrames(new Uint8Array(await response.arrayBuffer()))
    const status =
      /grpc-status:\s*(\d+)/.exec(reply?.trailers ?? '')?.[1] ??
      response.headers.get('grpc-status') ??
      '0'
    const message = reply?.messages[0]
    if (reply === null || status !== '0' || message === undefined)
      return { ok: false, reason: 'bad-response' }
    const info = decodeLightdInfo(message)
    if (info === null || info.chainName === '') return { ok: false, reason: 'bad-response' }
    if (info.chainName !== (options.expectedChain ?? 'test'))
      return { ok: false, reason: 'wrong-network' }
    return { ok: true, info, latencyMs: Math.round(now() - started) }
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'unreachable',
    }
  } finally {
    clearTimeout(timer)
  }
}
