import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/**
 * Sends real memos on the Zcash testnet (NU7) from the app's wallet and reads them back. Needs the
 * wallet built, a funded testnet seed in the file named by `LIVE_TESTNET_SEED_FILE`, and that file's
 * wallet birthday in `LIVE_TESTNET_BIRTHDAY`. Spends a fee (about 0.00015 TAZ) each run.
 *
 * It runs on the dev server, so the test can reach the app's own wallet object through the same
 * module the app uses, and send exactly what a feature would send.
 */
const seedFile = process.env['LIVE_TESTNET_SEED_FILE']
test.skip(seedFile === undefined, 'set LIVE_TESTNET_SEED_FILE to a funded testnet seed')
test.setTimeout(10 * 60_000)

const PASS = 'correct horse battery'
/** The app's wallet module, as the dev server serves it (the same instance the app uses). */
const RUNTIME = '/src/wallet/runtime.ts'

/** The part of the app's wallet module this test uses, as it is in the browser. */
interface Runtime {
  useWalletRuntime: {
    getState: () => {
      wallet: {
        ownAddress: () => Promise<string>
        sendMemos: (args: { to: string; memos: Uint8Array[] }) => Promise<{ txid: string }>
        receivedMemos: () => Promise<Uint8Array[]>
        sync: () => Promise<void>
      } | null
    }
  }
}

test('the app wallet sends two memos in one NU7 transaction and reads them back', async ({
  page,
}) => {
  const seed = readFileSync(seedFile ?? '', 'utf8').trim()
  const birthday = process.env['LIVE_TESTNET_BIRTHDAY'] ?? ''

  await page.goto('/settings')
  await page.getByLabel('New passphrase').first().fill(PASS)
  await page.getByLabel('Repeat the passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Save my data, encrypted' }).click()
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: 'Wallet' }).click()
  await page.getByLabel('Recovery phrase').fill(seed)
  await page.getByLabel('Starting block (optional)').fill(birthday)
  await page.getByRole('button', { name: 'Restore this wallet' }).click()
  await expect(page.getByText(/Up to date/)).toBeVisible({ timeout: 8 * 60_000 })
  await expect(page.getByTestId('spendable')).not.toHaveText(/^0 TAZ$/, { timeout: 60_000 })

  const marker = `zealed-live-${String(Date.now())}`
  const sent = await page.evaluate(
    async ({ text, path }) => {
      const runtime = (await import(path)) as Runtime
      const wallet = runtime.useWalletRuntime.getState().wallet
      if (wallet === null) throw new Error('no wallet')
      const memo = (suffix: string) => {
        const bytes = new Uint8Array(512)
        bytes[0] = 0xff
        bytes.set(new TextEncoder().encode(text + suffix), 1)
        return bytes
      }
      const to = await wallet.ownAddress()
      return wallet.sendMemos({ to, memos: [memo('-a'), memo('-b')] })
    },
    { text: marker, path: RUNTIME },
  )
  expect(sent.txid).toMatch(/^[0-9a-f]{64}$/)

  // Mined within a few 25-second blocks, then read back from the chain.
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ text, path }) => {
            const runtime = (await import(path)) as Runtime
            const wallet = runtime.useWalletRuntime.getState().wallet
            if (wallet === null) return []
            await wallet.sync()
            const decoder = new TextDecoder()
            return (await wallet.receivedMemos())
              .map((bytes) => decoder.decode(bytes.subarray(1)).replace(/\0+$/, ''))
              .filter((memo) => memo.startsWith(text))
              .sort()
          },
          { text: marker, path: RUNTIME },
        ),
      { timeout: 6 * 60_000, intervals: [15_000] },
    )
    .toEqual([`${marker}-a`, `${marker}-b`])
})
