import type { ChainClient, ChainInfo } from 'tlock-js'
import fixture from './fixtures/quicknet-beacons.json'
import { QUICKNET } from './tlock.ts'

/**
 * TEST DOUBLE for the drand network. It serves real, public, past quicknet beacons recorded in
 * `fixtures/quicknet-beacons.json`, so timelock decryption can be tested offline and for rounds
 * that are already in the past. It throws for any round it was not given, like a network that has
 * not published that round yet. App code never imports this.
 */
export const FIXTURE_ROUNDS = fixture.beacons.map((beacon) => beacon.round)

export function fixtureClient(
  options: { info?: ChainInfo; swap?: Record<number, number> } = {},
): ChainClient {
  const info = options.info ?? QUICKNET
  const lookup = (round: number) => {
    const wanted = options.swap?.[round] ?? round
    const beacon = fixture.beacons.find((candidate) => candidate.round === wanted)
    if (beacon === undefined) return Promise.reject(new Error('round not published'))
    // `swap` serves a different round's beacon under the requested number, to test forgery.
    return Promise.resolve({ ...beacon, round })
  }
  return {
    options: { disableBeaconVerification: true, noCache: true },
    chain: () => ({ baseUrl: 'fixture', info: () => Promise.resolve(info) }),
    get: lookup,
    latest: () => Promise.reject(new Error('no latest in the fixture')),
  }
}
