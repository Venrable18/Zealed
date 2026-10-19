import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { SimChain } from '../../../src/test/simChain.ts'
import { buildHarness, cleanHarness, forgeMemos, newActor, type Harness } from '../sim/harness.ts'
import { assertClean } from './support.ts'

const ZEC = 100_000_000n

test.describe.configure({ mode: 'serial' })

let harness: Harness
test.beforeAll(async () => {
  harness = await buildHarness()
})
test.afterAll(() => {
  cleanHarness(harness)
})

test('Unsigned: a card is published, an anonymous sender pays and writes, the recipient reads, replies, and verifies the receipt', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const chain = new SimChain()
  const recipient = await newActor(browser, harness, chain, baseURL, 'recipient')
  const sender = await newActor(browser, harness, chain, baseURL, 'sender', { fundsZat: 5n * ZEC })
  const rp = recipient.page
  const sp = sender.page

  // The recipient makes a card.
  await rp.goto('/unsigned')
  await rp.getByLabel('Display name').fill('Source Line')
  await rp.getByLabel(/Short bio/).fill('Tell me what you saw.')
  await rp.getByLabel(/Minimum payment/).fill('0.05')
  await rp.getByRole('button', { name: 'Create contact card' }).click()
  await expect(rp.getByRole('heading', { name: 'Your card' })).toBeVisible()
  const link = await rp.getByLabel('Card link').inputValue()
  expect(new URL(link).hash.length).toBeGreaterThan(20)
  expect(new URL(link).search).toBe('')

  // An anonymous sender opens the link, writes, pays, asks for a reply and keeps a receipt.
  await sp.goto(link)
  await expect(sp.getByRole('heading', { level: 1, name: 'Source Line' })).toBeVisible()
  const message = 'The shipment arrived on the 3rd. The documents are in the blue folder.'
  await sp.getByLabel('Your message').fill(message)
  await sp.getByLabel('Payment (ZEC)').fill('0.05')
  await sp.getByRole('checkbox', { name: /Allow a reply/ }).check()
  await sp.getByRole('checkbox', { name: /Keep a receipt/ }).check()
  await expect(sp.getByText('Network fee', { exact: true })).toBeVisible()
  await sp.getByRole('button', { name: 'Send message' }).click()
  await sp.getByRole('dialog').getByRole('button', { name: 'Pay and send' }).click()
  await expect(sp.getByRole('heading', { name: 'Message sent' })).toBeVisible()

  const download = sp.waitForEvent('download')
  await sp.getByRole('button', { name: 'Download receipt' }).first().click()
  const receiptPath = await (await download).path()
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as {
    saltHex: string
    recipient: string
  }
  expect(receipt.saltHex).toMatch(/^[0-9a-f]{32}$/)
  expect(receipt.recipient).toBe(chain.notes[0]?.to)

  // Value moved on the chain: 0.05 ZEC to the card, and the fee paid by the sender.
  expect(chain.receivedAt(receipt.recipient)).toBe(ZEC / 20n)
  expect(chain.balanceZat('sender')).toBeLessThan(5n * ZEC - ZEC / 20n)

  // The recipient reads it, with the amount, and sees what they earned.
  await rp.getByRole('button', { name: 'Check for messages' }).click()
  await expect(rp.getByText(message)).toBeVisible()
  await expect(rp.getByText(/· paid 0\.05 ZEC/)).toBeVisible()
  await expect(rp.getByLabel('Earned through this card')).toContainText('0.05 ZEC')

  // An underpaid message, junk and malformed memos arrive from outside. The underpaid one is hidden; the rest are ignored.
  const memos = await forgeMemos(rp, 'unsignedMemos', 'Buy cheap watches now!!!')
  chain.inject(receipt.recipient, memos, 1000n)
  chain.inject(receipt.recipient, [
    randomBytes(512),
    new TextEncoder().encode('thanks for dinner'),
    new Uint8Array(512).fill(0xff),
    randomBytes(40),
  ])
  await rp.getByRole('button', { name: 'Check for messages' }).click()
  await expect(rp.getByText('Below minimum (1)')).toBeVisible()
  await expect(rp.getByText('Buy cheap watches now!!!')).toBeHidden()
  await rp.getByText('Below minimum (1)').click()
  await expect(rp.getByText('Buy cheap watches now!!!')).toBeVisible()
  await expect(rp.getByLabel('Earned through this card')).toContainText(
    '1 message met your minimum',
  )

  // The recipient replies; the sender finds it at the fresh reply address.
  await rp.getByRole('button', { name: 'Reply' }).first().click()
  await rp.getByLabel(/Reply to/).fill('Thank you. Can you tell me more about the blue folder?')
  await rp.getByRole('button', { name: 'Send reply' }).click()
  await expect(rp.getByText('You replied.')).toBeVisible()
  await sp.getByRole('button', { name: 'Check for replies' }).click()
  await expect(sp.getByText('Thank you. Can you tell me more about the blue folder?')).toBeVisible()

  // The sender later proves what they sent: the recipient checks the revealed message against the receipt.
  await rp.getByLabel(/Salt, or the whole receipt/).fill(receipt.saltHex)
  await rp.getByLabel(/The message they say they sent/).fill(message)
  await rp.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(rp.getByText('It matches.')).toBeVisible()
  await rp.getByLabel(/The message they say they sent/).fill(message + ' (edited)')
  await rp.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(rp.getByText(/No message in your inbox carries this commitment/)).toBeVisible()

  await assertClean([recipient, sender], baseURL)
  await Promise.all([recipient.close(), sender.close()])
})
