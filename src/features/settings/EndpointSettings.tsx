import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { LIGHTWALLET_ENDPOINTS, type LightwalletEndpoint } from '../../config/network.ts'
import { checkEndpoint, type EndpointHealth } from '../../lib/lightwalletd.ts'

const REASONS = {
  unreachable: 'Could not connect. Check your connection, or try another server.',
  timeout: 'It took too long to answer.',
  'bad-response': 'It answered, but not in a way Zealed understands.',
  'wrong-network': 'It is not a testnet server. Zealed only works on testnet.',
} as const

const BRANCH_NAMES: Record<string, string> = { '77190ad9': 'NU7' }

interface EndpointSettingsProps {
  selectedUrl: string
  onSelect: (url: string) => void
  /** Replaced in tests. */
  check?: (url: string) => Promise<EndpointHealth>
  endpoints?: readonly LightwalletEndpoint[]
}

/**
 * Choose the light-wallet server and test it. Only servers listed in the app's configuration can be
 * used: the page's security policy blocks every other address. The check runs only when the button
 * is pressed, and sends an empty request that identifies nothing about you.
 */
export function EndpointSettings({
  selectedUrl,
  onSelect,
  check = (url) => checkEndpoint(url),
  endpoints = LIGHTWALLET_ENDPOINTS,
}: EndpointSettingsProps) {
  const [results, setResults] = useState<Record<string, EndpointHealth | 'checking'>>({})

  async function run(url: string) {
    setResults((current) => ({ ...current, [url]: 'checking' }))
    const result = await check(url)
    setResults((current) => ({ ...current, [url]: result }))
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-semibold">Light-wallet server</legend>
      <p className="text-sm text-muted">
        The server your wallet asks for new blocks. It sees your connection, but not your keys,
        balances or messages. Only the servers below can be used.
      </p>
      {endpoints.map((endpoint) => {
        const result = results[endpoint.url]
        return (
          <div key={endpoint.url} className="space-y-2 rounded-control border border-line p-3">
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="endpoint"
                value={endpoint.url}
                checked={selectedUrl === endpoint.url}
                onChange={() => {
                  onSelect(endpoint.url)
                }}
                className="size-5 accent-seal"
              />
              <span>
                {endpoint.label}
                <span className="block break-all text-xs text-muted">{endpoint.url}</span>
              </span>
            </label>
            <Button
              variant="secondary"
              busy={result === 'checking'}
              aria-label={`Check ${endpoint.label}`}
              onClick={() => {
                void run(endpoint.url)
              }}
            >
              Check connection
            </Button>
            {result !== undefined && result !== 'checking' && (
              <p
                role={result.ok ? 'status' : 'alert'}
                className={result.ok ? 'text-sm' : 'text-sm font-medium text-bad'}
              >
                {result.ok
                  ? `Working. Testnet, block ${result.info.blockHeight.toLocaleString('en-US')}, network upgrade ${BRANCH_NAMES[result.info.consensusBranchId] ?? 'unknown'} (${result.info.consensusBranchId}), answered in ${String(result.latencyMs)} ms.`
                  : REASONS[result.reason]}
              </p>
            )}
          </div>
        )
      })}
      {endpoints.length < 2 && (
        <p className="text-sm text-muted">
          There is only one server for now. A backup server will be added before launch.
        </p>
      )}
    </fieldset>
  )
}
