import { describe, expect, it } from 'vitest'
import { deserialize, serialize } from '../lib/serialize.ts'
import { createMemoryBackend } from './backend.ts'
import { MIN_PASSPHRASE_LENGTH, Vault, VaultError, passphraseProblem } from './vault.ts'

const PASS = 'correct horse battery'
/** Low iterations: the cost of key stretching is not what these tests are about. */
const fast = { iterations: 1000 }

function setup() {
  const backend = createMemoryBackend()
  return { backend, vault: new Vault(backend, fast) }
}

async function failsWith(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'VaultError', code })
}

describe('serialize', () => {
  it('round-trips bigint, bytes, nesting and nothing', () => {
    const value = {
      a: 5n,
      b: Uint8Array.from([0, 1, 255]),
      c: [{ d: -7n }],
      e: 'text 🎁',
      f: null,
      g: [1, 2],
    }
    expect(deserialize(serialize(value))).toEqual(value)
    expect(deserialize(serialize(undefined))).toBeNull()
    const big = Uint8Array.from({ length: 200_000 }, (_, i) => i % 256)
    expect(deserialize(serialize(big))).toEqual(big)
  })

  it('does not turn look-alike text into a number or bytes', () => {
    expect(deserialize('{"$bigint":"abc"}')).toEqual({ $bigint: 'abc' })
    expect(() => deserialize('not json')).toThrow()
  })
})

describe('passphraseProblem', () => {
  it('asks for length and some variety', () => {
    expect(passphraseProblem('short')).toContain(String(MIN_PASSPHRASE_LENGTH))
    expect(passphraseProblem('aaaaaaaaaaaa')).toContain('variety')
    expect(passphraseProblem(PASS)).toBeNull()
    expect(passphraseProblem('ÀÀÀÀÀÀÀÀÀÀ'.normalize('NFD'))).not.toBeNull()
  })
})

describe('Vault', () => {
  it('starts with nothing, creates once, and is unlocked after creating', async () => {
    const { vault } = setup()
    expect(await vault.exists()).toBe(false)
    await vault.create(PASS)
    expect(await vault.exists()).toBe(true)
    expect(vault.unlocked).toBe(true)
    await failsWith(vault.create(PASS), 'exists')
  })

  it('refuses a weak passphrase and creates nothing', async () => {
    const { vault } = setup()
    await failsWith(vault.create('short'), 'weak-passphrase')
    expect(await vault.exists()).toBe(false)
  })

  it('stores and returns values, including bigint and bytes', async () => {
    const { vault } = setup()
    await vault.create(PASS)
    const value = { pots: [{ id: 'x', total: 123_456_789n, key: Uint8Array.from([9, 8, 7]) }] }
    await vault.set('pots', value)
    expect(await vault.get('pots')).toEqual(value)
    expect(await vault.get('missing')).toBeUndefined()
    await vault.delete('pots')
    expect(await vault.get('pots')).toBeUndefined()
  })

  it('keeps nothing readable in storage', async () => {
    const { vault, backend } = setup()
    await vault.create(PASS)
    await vault.set('letters', {
      text: 'the documents are in the blue folder',
      seed: 'abandon ability able',
    })
    const raw = new TextDecoder('latin1').decode(
      Uint8Array.from([...backend.records.values()].flatMap((r) => Array.from(r))),
    )
    expect(raw).not.toContain('blue folder')
    expect(raw).not.toContain('abandon')
    expect([...backend.records.keys()]).toEqual(['letters'])
    const meta = await backend.getMeta()
    expect(
      JSON.stringify(meta, (_k, v: unknown) => (v instanceof Uint8Array ? Array.from(v) : v)),
    ).not.toContain(PASS)
  })

  it('locks, and then nothing can be read or written', async () => {
    const { vault } = setup()
    await vault.create(PASS)
    await vault.set('a', 1)
    vault.lock()
    expect(vault.unlocked).toBe(false)
    await failsWith(vault.get('a'), 'locked')
    await failsWith(vault.set('a', 2), 'locked')
    await failsWith(vault.delete('a'), 'locked')
  })

  it('unlocks with the right passphrase and shows the saved data', async () => {
    const { vault, backend } = setup()
    await vault.create(PASS)
    await vault.set('a', { n: 5n })
    vault.lock()
    const later = new Vault(backend, fast)
    await later.unlock(PASS)
    expect(await later.get('a')).toEqual({ n: 5n })
  })

  it('refuses a wrong passphrase without revealing anything, and stays locked', async () => {
    const { vault, backend } = setup()
    await vault.create(PASS)
    await vault.set('a', 'secret')
    vault.lock()
    const later = new Vault(backend, fast)
    await failsWith(later.unlock('correct horse batterz'), 'wrong-passphrase')
    await failsWith(later.unlock(''), 'wrong-passphrase')
    expect(later.unlocked).toBe(false)
    await failsWith(later.get('a'), 'locked')
    await failsWith(new Vault(createMemoryBackend(), fast).unlock(PASS), 'missing')
  })

  it('treats passphrases that look the same in Unicode as the same', async () => {
    const { vault, backend } = setup()
    await vault.create('Café au lait 2026')
    vault.lock()
    await new Vault(backend, fast).unlock('Café au lait 2026')
  })

  it('detects any changed byte, and a record moved under another name', async () => {
    const { vault, backend } = setup()
    await vault.create(PASS)
    await vault.set('a', 'first')
    await vault.set('b', 'second')
    const a = backend.records.get('a') ?? new Uint8Array()
    for (const index of [0, 12, a.length - 1]) {
      const tampered = a.slice()
      tampered[index] = (tampered[index] ?? 0) ^ 1
      await backend.putRecord('a', tampered)
      await failsWith(vault.get('a'), 'corrupt')
    }
    await backend.putRecord('a', a.slice(0, 20))
    await failsWith(vault.get('a'), 'corrupt')
    await backend.putRecord('a', backend.records.get('b') ?? new Uint8Array())
    await failsWith(vault.get('a'), 'corrupt')
  })

  it('uses a different salt and a different ciphertext every time', async () => {
    const a = setup()
    const b = setup()
    await a.vault.create(PASS)
    await b.vault.create(PASS)
    expect((await a.backend.getMeta())?.salt).not.toEqual((await b.backend.getMeta())?.salt)
    await a.vault.set('x', 'same')
    const first = a.backend.records.get('x')
    await a.vault.set('x', 'same')
    expect(a.backend.records.get('x')).not.toEqual(first)
  })

  it('verifies a passphrase without changing its state', async () => {
    const { vault } = setup()
    await vault.create(PASS)
    expect(await vault.verify(PASS)).toBe(true)
    expect(await vault.verify('nope nope nope')).toBe(false)
    expect(vault.unlocked).toBe(true)
    vault.lock()
    expect(await vault.verify(PASS)).toBe(true)
    expect(vault.unlocked).toBe(false)
  })

  it('changes the passphrase: everything is re-encrypted, the old one stops working', async () => {
    const { vault, backend } = setup()
    await vault.create(PASS)
    await vault.set('a', { v: 1n })
    await vault.set('b', 'two')
    const oldMeta = await backend.getMeta()
    await vault.changePassphrase(PASS, 'a brand new passphrase')
    expect((await backend.getMeta())?.salt).not.toEqual(oldMeta?.salt)
    expect(await vault.get('a')).toEqual({ v: 1n })

    vault.lock()
    const later = new Vault(backend, fast)
    await failsWith(later.unlock(PASS), 'wrong-passphrase')
    await later.unlock('a brand new passphrase')
    expect(await later.get('b')).toBe('two')
  })

  it('refuses to change the passphrase with a wrong old one or a weak new one, changing nothing', async () => {
    const { vault, backend } = setup()
    await vault.create(PASS)
    await vault.set('a', 'keep')
    await failsWith(
      vault.changePassphrase('wrong wrong wrong', 'a brand new passphrase'),
      'wrong-passphrase',
    )
    await failsWith(vault.changePassphrase(PASS, 'short'), 'weak-passphrase')
    vault.lock()
    const later = new Vault(backend, fast)
    await later.unlock(PASS)
    expect(await later.get('a')).toBe('keep')
  })

  it('wipes everything', async () => {
    const { vault, backend } = setup()
    await vault.create(PASS)
    await vault.set('a', 'x')
    await vault.wipe()
    expect(vault.unlocked).toBe(false)
    expect(await vault.exists()).toBe(false)
    expect(backend.records.size).toBe(0)
    await vault.create(PASS)
    expect(await vault.get('a')).toBeUndefined()
  })

  it('errors carry only a fixed code', async () => {
    const { vault } = setup()
    await vault.create(PASS)
    vault.lock()
    try {
      await vault.unlock('definitely wrong secret')
    } catch (error) {
      expect(error).toBeInstanceOf(VaultError)
      expect((error as Error).message).toBe('wrong-passphrase')
    }
  })
})
