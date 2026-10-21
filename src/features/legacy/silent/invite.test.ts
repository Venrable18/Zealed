import { describe, expect, it } from 'vitest'
import { textToBase64Url } from '../../../lib/base64url.ts'
import { decodeInvite, encodeInvite, inviteUrl, readInviteFromHash } from './invite.ts'

describe('guardian invitations', () => {
  it('round-trips with and without a name', () => {
    expect(decodeInvite(encodeInvite({ owner: 'Ada' }))).toEqual({ owner: 'Ada' })
    expect(decodeInvite(encodeInvite({}))).toEqual({})
    expect(decodeInvite(encodeInvite({ owner: '   ' }))).toEqual({})
    expect(decodeInvite(encodeInvite({ owner: 'Zoë 🎁' }))).toEqual({ owner: 'Zoë 🎁' })
  })

  it('puts the data in the fragment, never the path or query', () => {
    const url = new URL(inviteUrl('https://zealed.example', { owner: 'Ada' }))
    expect(url.pathname).toBe('/invite')
    expect(url.search).toBe('')
    expect(readInviteFromHash(url.hash)).toEqual({ owner: 'Ada' })
  })

  it('holds nothing but the name', () => {
    const text = atob(encodeInvite({ owner: 'Ada' }).replaceAll('-', '+').replaceAll('_', '/'))
    expect(JSON.parse(text)).toEqual({ v: 1, r: 'guardian', o: 'Ada' })
  })

  const enc = (value: unknown) => textToBase64Url(JSON.stringify(value))

  it.each([
    ['empty', ''],
    ['not base64', '!!!'],
    ['not json', textToBase64Url('hello')],
    ['not an object', enc(5)],
    ['wrong version', enc({ v: 2, r: 'guardian' })],
    ['another role', enc({ v: 1, r: 'heir' })],
    ['name not text', enc({ v: 1, r: 'guardian', o: 7 })],
    ['blank name', enc({ v: 1, r: 'guardian', o: '  ' })],
    ['name with a line break', enc({ v: 1, r: 'guardian', o: 'a\nb' })],
    ['name with hidden characters', enc({ v: 1, r: 'guardian', o: 'a‮b' })],
    ['name too long', enc({ v: 1, r: 'guardian', o: 'x'.repeat(61) })],
    ['too big', 'A'.repeat(401)],
  ])('refuses %s', (_label, input) => {
    expect(decodeInvite(input)).toBeNull()
  })

  it('needs the # to read from a hash', () => {
    expect(readInviteFromHash('')).toBeNull()
    expect(readInviteFromHash(encodeInvite({}))).toBeNull()
  })
})
