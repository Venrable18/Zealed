import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
const SEED = readFileSync('/tmp/zdemo/seed.txt', 'utf8').trim()
const PASS = 'correct horse battery'
const label = process.argv[2] ?? 'run'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage()
const retry = async (fn) => { for (let i = 0; i < 6; i++) { try { return await fn() } catch (e) { await page.waitForTimeout(4000) } } return fn() }
const money = async () => ({
  spend: await page.getByTestId('spendable').textContent().catch(() => null),
  pend: await page.getByTestId('pending').textContent().catch(() => null),
})
await page.goto('http://localhost:4320/settings')
await page.getByLabel('Lock after').selectOption('60')
await page.getByLabel('New passphrase').first().fill(PASS)
await page.getByLabel('Repeat the passphrase').fill(PASS)
await page.getByRole('button', { name: 'Save my data, encrypted' }).click()
await page.getByText('Your data is now saved on this device, encrypted.').waitFor()
await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Wallet' }).click()
await page.getByLabel('Recovery phrase').fill(SEED)
await page.getByLabel('Starting block (optional)').fill('4548000')
await page.getByRole('button', { name: 'Restore this wallet' }).click()
await page.getByText(/Up to date/).waitFor({ timeout: 300000 })
await page.getByTestId('spendable').filter({ hasNotText: '…' }).waitFor({ timeout: 60000 })
console.log(label, 'before send     ', JSON.stringify(await money()))
// The demo wallet pays itself 0.001 TAZ: a transaction this browser builds, so its expiry is recorded.
await page.waitForLoadState('networkidle').catch(() => undefined)
const sent = await page.evaluate(async () => {
  const runtime = await import('/src/wallet/runtime.ts')
  const wallet = runtime.useWalletRuntime.getState().wallet
  const to = await wallet.ownAddress()
  return (await wallet.sendPayment({ to, zat: 100000n, memos: [] })).txid
})
console.log(label, 'sent', sent.slice(0, 12))
const tipOf = async () => Number(await retry(() => page.evaluate(async () => {
  const runtime = await import('/src/wallet/runtime.ts')
  return (await runtime.useWalletRuntime.getState().wallet.diagnostics()).chainTip
})))
const start = await tipOf()
console.log(label, 'tip at send', start)
// Watch the balance for 60 blocks: the transaction expires 40 blocks after it was built.
let lastTip = start
for (let i = 0; i < 200; i++) {
  await page.waitForTimeout(30000)
  await page.getByRole('button', { name: 'Check now' }).click().catch(() => undefined)
  await page.waitForTimeout(8000)
  const tip = await tipOf().catch(() => lastTip)
  lastTip = tip
  const m = await money()
  console.log(label, `+${tip - start} blocks`, JSON.stringify(m))
  if (tip - start >= 60) break
}
await browser.close()
