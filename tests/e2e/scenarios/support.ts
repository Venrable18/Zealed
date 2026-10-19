import { expect } from '@playwright/test'
import type { Actor } from '../sim/harness.ts'

/**
 * What every scenario checks at the end, for every actor: nothing left the app's own origin (or the
 * extra origins a scenario allows), nothing logged an error, and nothing private was stored. Storage
 * holds only the four non-sensitive settings, no cookies, no session data, no IndexedDB.
 */
export async function assertClean(
  actors: Actor[],
  baseURL: string,
  allowedOrigins: string[] = [],
  /** Console messages a scenario causes on purpose, for example a blocked server. */
  expectedProblems: RegExp[] = [],
) {
  const own = new URL(baseURL).origin
  for (const actor of actors) {
    for (const url of actor.requests) {
      const origin = new URL(url).origin
      expect([own, ...allowedOrigins], `${actor.id} requested ${url}`).toContain(origin)
    }
    expect(
      actor.problems.filter(
        (problem) => !expectedProblems.some((pattern) => pattern.test(problem)),
      ),
      `${actor.id} had problems`,
    ).toEqual([])
    const stored = await actor.page.evaluate(async () => ({
      local: Object.keys(localStorage),
      settings: Object.keys(
        (
          JSON.parse(localStorage.getItem('zealed:settings') ?? '{"state":{}}') as {
            state: Record<string, unknown>
          }
        ).state,
      ).sort(),
      session: sessionStorage.length,
      cookie: document.cookie,
      databases: (await indexedDB.databases()).length,
    }))
    expect(
      stored.local.every((key) => key === 'zealed:settings'),
      `${actor.id} stored ${stored.local.join()}`,
    ).toBe(true)
    expect(
      stored.settings.every((key) =>
        ['autoLockMinutes', 'demoMode', 'endpointUrl', 'theme'].includes(key),
      ),
    ).toBe(true)
    expect(stored.session).toBe(0)
    expect(stored.cookie).toBe('')
    expect(stored.databases).toBe(0)
  }
}

export const ZEC = 100_000_000n
