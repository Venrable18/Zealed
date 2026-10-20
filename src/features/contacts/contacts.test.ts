import { beforeEach, describe, expect, it } from 'vitest'
import { textToBase64Url } from '../../lib/base64url.ts'
import {
  ADD_PATH,
  CONTACT_NAME_MAX,
  contactUrl,
  decodeContact,
  encodeContact,
  findContact,
  parseAddressInput,
  readContactFromHash,
  useContacts,
  validateContact,
} from './contacts.ts'

const A = 'utest1adaaddressadaaddressadaaddress'
const B = 'utest1boaddressboaddressboaddressbo'

beforeEach(() => {
  useContacts.setState({ contacts: [] })
})

describe('validateContact', () => {
  it('accepts a name and an address and trims them', () => {
    expect(validateContact('  Ada ', ` ${A} `, [])).toEqual({ ok: true, name: 'Ada', address: A })
  })

  it('explains each problem on its own field', () => {
    const errors = (name: string, address: string) => {
      const r = validateContact(name, address, [])
      return r.ok ? {} : r.errors
    }
    expect(errors('', A).name).toBeDefined()
    expect(errors('x'.repeat(CONTACT_NAME_MAX + 1), A).name).toBeDefined()
    expect(errors('two\nlines', A).name).toBeDefined()
    expect(errors('bad‮name', A).name).toBeDefined()
    expect(errors('Ada', '').address).toBeDefined()
    expect(errors('Ada', 'has spaces and symbols!').address).toContain('does not look like')
    expect(errors('Ada', A)).toEqual({})
  })

  it('refuses an address that is already saved, naming the contact', () => {
    useContacts.getState().add('Ada', A)
    const r = validateContact('Someone else', A, useContacts.getState().contacts)
    expect(!r.ok && r.errors.address).toBe('Already saved as Ada.')
  })
})

describe('contacts store', () => {
  it('adds, finds, renames and removes', () => {
    const added = useContacts.getState().add('Ada', A)
    expect(added.ok).toBe(true)
    useContacts.getState().add('Bo', B)
    expect(useContacts.getState().contacts.map((c) => c.name)).toEqual(['Ada', 'Bo'])
    expect(findContact(useContacts.getState().contacts, ` ${B} `)?.name).toBe('Bo')
    expect(
      findContact(useContacts.getState().contacts, 'utest1nobodynobodynobodynobodynobody'),
    ).toBeUndefined()

    const id = added.ok ? added.contact.id : ''
    expect(useContacts.getState().rename(id, 'Ada L.')).toBe(true)
    expect(useContacts.getState().rename(id, '')).toBe(false)
    expect(useContacts.getState().rename('nope', 'X')).toBe(false)
    expect(useContacts.getState().contacts[0]?.name).toBe('Ada L.')

    useContacts.getState().remove(id)
    expect(useContacts.getState().contacts.map((c) => c.name)).toEqual(['Bo'])
  })

  it('does not add an invalid or duplicate contact', () => {
    expect(useContacts.getState().add('', A).ok).toBe(false)
    expect(useContacts.getState().add('Ada', 'nope').ok).toBe(false)
    useContacts.getState().add('Ada', A)
    expect(useContacts.getState().add('Again', A).ok).toBe(false)
    expect(useContacts.getState().contacts).toHaveLength(1)
  })

  it('gives each contact a different id', () => {
    useContacts.getState().add('Ada', A)
    useContacts.getState().add('Bo', B)
    const [a, b] = useContacts.getState().contacts
    expect(a?.id).not.toBe(b?.id)
    expect(a?.id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('contact links', () => {
  it('round-trips, with the data in the fragment only', () => {
    expect(decodeContact(encodeContact({ address: A, name: 'Ada — friend 🎁' }))).toEqual({
      address: A,
      name: 'Ada — friend 🎁',
    })
    expect(decodeContact(encodeContact({ address: A }))).toEqual({ address: A })
    expect(decodeContact(encodeContact({ address: A, name: '' }))).toEqual({ address: A })
    const url = new URL(contactUrl('https://zealed.example', { address: A, name: 'Ada' }))
    expect(url.pathname).toBe(ADD_PATH)
    expect(url.search).toBe('')
    expect(readContactFromHash(url.hash)).toEqual({ address: A, name: 'Ada' })
    expect(readContactFromHash('')).toBeNull()
  })

  it('rejects hostile or broken input without throwing', () => {
    const encode = (value: unknown) => textToBase64Url(JSON.stringify(value))
    for (const bad of [
      '',
      'garbage!',
      'A'.repeat(1001),
      encode(null),
      encode([]),
      encode({ v: 2, a: A }),
      encode({ v: 1, a: 'bad address' }),
      encode({ v: 1, a: 5 }),
      encode({ v: 1, a: A, n: 'x'.repeat(100) }),
      encode({ v: 1, a: A, n: 'two\nlines' }),
      encode({ v: 1, a: A, n: 'a‮b' }),
      encode({ v: 1, a: A, n: 5 }),
    ]) {
      expect(decodeContact(bad)).toBeNull()
    }
  })

  it('never throws on random text (seeded fuzz)', () => {
    let a = 17
    const next = () => ((a = (a * 1664525 + 1013904223) | 0) >>> 0) / 4294967296
    for (let i = 0; i < 2000; i++) {
      const junk = Array.from({ length: Math.floor(next() * 100) }, () =>
        String.fromCharCode(32 + Math.floor(next() * 95)),
      ).join('')
      expect(() => decodeContact(junk)).not.toThrow()
      expect(() => parseAddressInput(junk)).not.toThrow()
    }
  })
})

describe('parseAddressInput', () => {
  it('reads a plain address, a payment request and a contact link', () => {
    expect(parseAddressInput(`  ${A}\n`)).toEqual({ address: A })
    expect(parseAddressInput(`zcash:${A}`)).toEqual({ address: A })
    expect(parseAddressInput(`ZCASH:${A}?amount=1&label=Ada%20Lovelace`)).toEqual({ address: A })
    expect(
      parseAddressInput(contactUrl('https://zealed.example', { address: B, name: 'Bo' })),
    ).toEqual({ address: B, name: 'Bo' })
  })

  it('returns null for anything else', () => {
    for (const bad of [
      '',
      '   ',
      'hello',
      'zcash:',
      'zcash:not an address',
      'zcash:?amount=1',
      'https://example.com',
      'https://zealed.example/add#garbage',
      `${A} extra words`,
    ]) {
      expect(parseAddressInput(bad)).toBeNull()
    }
  })
})
