import { expect } from '@playwright/test'
import type { Actor } from '../sim/harness.ts'

export const ZEC = 100_000_000n

export interface CleanOptions {
  /** Extra origins an actor may contact, for example drand. */
  allowedOrigins?: string[]
  /** Console messages a scenario causes on purpose, for example a blocked server. */
  expectedProblems?: RegExp[]
  /** The actor chose to keep data on the device, so the encrypted vault database may exist. */
  allowVault?: boolean
  /** Text that must not appear anywhere in the vault's stored bytes. */
  secretsNotInVault?: string[]
}

/**
 * What every scenario checks at the end, for every actor:
 * - only the app's own origin (and any extra origin the scenario allows) was contacted;
 * - no console message of any kind, because the app logs nothing;
 * - no `Referer` header was sent to another origin;
 * - no request URL carried an address or pot data (those live in the URL fragment, never sent);
 * - storage holds only the five non-sensitive settings, no cookies and no session data, and either
 *   no IndexedDB at all or, when the actor chose a passphrase, only the encrypted vault.
 */
export async function assertClean(actors: Actor[], baseURL: string, options: CleanOptions = {}) {
  const own = new URL(baseURL).origin
  const allowedOrigins = options.allowedOrigins ?? []
  const expectedProblems = options.expectedProblems ?? []
  for (const actor of actors) {
    for (const url of actor.requests) {
      expect([own, ...allowedOrigins], `${actor.id} requested ${url}`).toContain(
        new URL(url).origin,
      )
      expect(url, `${actor.id} sent private-looking data in ${url}`).not.toMatch(/utest1|#pot=/)
    }
    expect(actor.logs, `${actor.id} logged something`).toEqual([])
    expect(actor.referers, `${actor.id} sent a Referer to another origin`).toEqual([])
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
      databases: (await indexedDB.databases()).map((db) => db.name ?? ''),
    }))
    expect(
      stored.local.every((key) => key === 'zealed:settings'),
      `${actor.id} stored ${stored.local.join()}`,
    ).toBe(true)
    expect(
      stored.settings.every((key) =>
        ['autoLockMinutes', 'demoMode', 'endpointUrl', 'language', 'theme'].includes(key),
      ),
    ).toBe(true)
    expect(stored.session).toBe(0)
    expect(stored.cookie).toBe('')
    expect(stored.databases, `${actor.id} has databases`).toEqual(
      options.allowVault === true ? ['zealed-vault'] : [],
    )

    if (options.allowVault === true && (options.secretsNotInVault?.length ?? 0) > 0) {
      const raw = await actor.page.evaluate(
        () =>
          new Promise<string>((resolve, reject) => {
            const open = indexedDB.open('zealed-vault')
            open.onerror = () => {
              reject(new Error('open failed'))
            }
            open.onsuccess = () => {
              const db = open.result
              const names = Array.from(db.objectStoreNames)
              const tx = db.transaction(names, 'readonly')
              let text = ''
              let left = names.length
              for (const name of names) {
                const all = tx.objectStore(name).getAll()
                all.onsuccess = () => {
                  for (const value of all.result as unknown[])
                    text +=
                      value instanceof Uint8Array
                        ? new TextDecoder('latin1').decode(value)
                        : JSON.stringify(value, (_k, v: unknown) =>
                            v instanceof Uint8Array ? Array.from(v) : v,
                          )
                  if (--left === 0) {
                    db.close()
                    resolve(text)
                  }
                }
              }
            }
          }),
      )
      for (const secret of options.secretsNotInVault ?? [])
        expect(raw, `${actor.id}'s vault holds readable "${secret}"`).not.toContain(secret)
    }
  }
}
