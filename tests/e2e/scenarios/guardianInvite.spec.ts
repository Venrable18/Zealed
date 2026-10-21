import { expect, test } from '@playwright/test'
import { SimChain } from '../../../src/test/simChain.ts'
import { buildHarness, cleanHarness, newActor, type Harness } from '../sim/harness.ts'
import { assertClean } from './support.ts'

test.describe.configure({ mode: 'serial' })

let harness: Harness
test.beforeAll(async () => {
  harness = await buildHarness()
})
test.afterAll(() => {
  cleanHarness(harness)
})

test('Guardian invitation: the owner invites, the guardian replies with an address, the owner pastes it', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL')
  const chain = new SimChain()
  const owner = await newActor(browser, harness, chain, baseURL, 'owner')
  const guardian = await newActor(browser, harness, chain, baseURL, 'guardian')
  const op = owner.page
  const gp = guardian.page

  // The owner makes an invitation from the guardian setup.
  await op.goto('/legacy/silent')
  await op.getByText('Invite a guardian').click()
  await op.getByLabel('Your name (optional)').fill('Ada')
  const invitation = await op.getByLabel('Invitation link').inputValue()
  expect(new URL(invitation).hash.length).toBeGreaterThan(10)
  // It carries the name and nothing else: no address, no letter, no money.
  expect(Buffer.from(new URL(invitation).hash.slice(1), 'base64url').toString()).toBe(
    '{"v":1,"r":"guardian","o":"Ada"}',
  )

  // The guardian opens it in a different browser, reads what the role means, and answers.
  await gp.goto(new URL(invitation).pathname + new URL(invitation).hash)
  await expect(gp.getByText('Ada asks you to be a guardian.')).toBeVisible()
  await expect(gp.getByText('What a guardian does')).toBeVisible()
  await gp.getByLabel('Your name (optional)').fill('Bo')
  const reply = gp.getByLabel('Reply link', { exact: true })
  await expect(reply).toHaveValue(/\/add#/)
  const replyLink = await reply.inputValue()
  expect(new URL(replyLink).search).toBe('')

  // The owner pastes the reply into the first guardian field: the address is filled in.
  const field = op.getByLabel('Guardian 1 address')
  await field.fill(replyLink)
  await expect(field).toHaveValue(guardian.address)

  // Opening the reply link instead adds the guardian as a contact, named as they chose.
  await op.goto(new URL(replyLink).pathname + new URL(replyLink).hash)
  await expect(op.getByLabel('Name', { exact: true })).toHaveValue('Bo')
  await op.getByRole('button', { name: 'Save contact' }).click()
  await expect(op.getByText('Bo was saved.')).toBeVisible()

  await assertClean([owner, guardian], baseURL)
  await Promise.all([owner.close(), guardian.close()])
})
