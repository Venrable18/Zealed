import { base64UrlToText, textToBase64Url } from '../../../lib/base64url.ts'
import { CONTACT_NAME_MAX } from '../../contacts/contacts.ts'
import { countGraphemes } from '../../blindpot/pot.ts'
import { isPlainText } from '../../unsigned/card.ts'

/**
 * A guardian invitation: a link an owner sends to someone they would like as a guardian. It holds
 * only the owner's (optional) name, so there is nothing private in it. The data is in the URL
 * fragment, which servers never see. The guardian answers with an ordinary contact link.
 */
export const INVITE_PATH = '/invite'
const MAX_FRAGMENT_CHARS = 400
const VERSION = 1

export interface GuardianInvite {
  /** The owner's name as they chose to write it. Untrusted when read: anyone can make an invitation. */
  owner?: string
}

export function encodeInvite(invite: GuardianInvite): string {
  const owner = invite.owner?.trim() ?? ''
  return textToBase64Url(
    JSON.stringify({ v: VERSION, r: 'guardian', ...(owner === '' ? {} : { o: owner }) }),
  )
}

export function inviteUrl(origin: string, invite: GuardianInvite): string {
  return `${origin}${INVITE_PATH}#${encodeInvite(invite)}`
}

/** Reads an invitation from untrusted input. Returns null for anything invalid. Never throws. */
export function decodeInvite(encoded: string): GuardianInvite | null {
  if (encoded === '' || encoded.length > MAX_FRAGMENT_CHARS) return null
  const text = base64UrlToText(encoded)
  if (text === null) return null
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return null
    const { v, r, o } = data as Record<string, unknown>
    if (v !== VERSION || r !== 'guardian') return null
    if (o === undefined) return {}
    if (
      typeof o !== 'string' ||
      o.trim() === '' ||
      countGraphemes(o) > CONTACT_NAME_MAX ||
      !isPlainText(o) ||
      o.includes('\n')
    )
      return null
    return { owner: o }
  } catch {
    return null
  }
}

export function readInviteFromHash(hash: string): GuardianInvite | null {
  return hash.startsWith('#') ? decodeInvite(hash.slice(1)) : null
}
