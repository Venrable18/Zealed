import { describe, expect, it } from 'vitest'
import { LIGHTWALLET_ENDPOINTS } from '../config/network.ts'
import { checkEndpoint } from './lightwalletd.ts'

/** Runs against the real testnet light-wallet server. Needs the internet. Skipped unless LIVE_DRAND=1 (see `npm run test:live`). */
describe.skipIf(process.env['LIVE_DRAND'] !== '1')(
  'the configured light-wallet endpoints (live)',
  () => {
    for (const endpoint of LIGHTWALLET_ENDPOINTS) {
      it(`${endpoint.label} is reachable and on testnet`, async () => {
        const result = await checkEndpoint(endpoint.url)
        expect(result).toMatchObject({ ok: true, info: { chainName: 'test' } })
        if (result.ok) {
          expect(result.info.blockHeight).toBeGreaterThan(4_000_000)
          expect(result.info.consensusBranchId).toMatch(/^[0-9a-f]{8}$/)
          process.stdout.write(
            `\n  ${endpoint.label}: height ${String(result.info.blockHeight)}, branch ${result.info.consensusBranchId}, ${String(result.latencyMs)} ms, ${result.info.version}\n`,
          )
        }
      }, 20_000)
    }
  },
)
