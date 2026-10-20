import { create } from 'zustand'
import { base64UrlToText, textToBase64Url } from '../../lib/base64url.ts'
import { countGraphemes } from '../blindpot/pot.ts'
import { isPlainText } from '../unsigned/card.ts'
import { looksLikeAddress } from '../legacy/validate.ts'

export const CONTACT_NAME_MAX = 60

export interface Contact {
  id: string
  name: string
  address: string
}

export type ContactField = 'name' | 'address'

export type AddContactResult =
  { ok: true; contact: Contact } | { ok: false; errors: Partial<Record<ContactField, string>> }

/** Checks a name and address typed by a person. Returns the cleaned values or the problems. */
export function validateContact(
  name: string,
  address: string,
  existing: readonly Contact[],
  ignoreId?: string,
):
  | { ok: true; name: string; address: string }
  | { ok: false; errors: Partial<Record<ContactField, string>> } {
  const errors: Partial<Record<ContactField, string>> = {}
  const cleanName = name.trim()
  const cleanAddress = address.trim()
  if (cleanName === '') errors.name = 'Give this contact a name.'
  else if (countGraphemes(cleanName) > CONTACT_NAME_MAX)
    errors.name = `Keep the name to ${String(CONTACT_NAME_MAX)} characters or fewer.`
  else if (!isPlainText(cleanName) || cleanName.includes('\n'))
    errors.name = 'The name has characters that cannot be shown.'

  if (cleanAddress === '') errors.address = 'Enter an address.'
  else if (!looksLikeAddress(cleanAddress))
    errors.address = 'That does not look like a Zcash address.'
  else {
    const same = existing.find((c) => c.address === cleanAddress && c.id !== ignoreId)
    if (same !== undefined) errors.address = `Already saved as ${same.name}.`
  }
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, name: cleanName, address: cleanAddress }
}

function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

interface ContactsState {
  contacts: Contact[]
  add: (name: string, address: string) => AddContactResult
  rename: (id: string, name: string) => boolean
  remove: (id: string) => void
  /** Replaces everything, used when saved data is loaded. */
  setAll: (contacts: Contact[]) => void
}

/** Names for addresses, so people do not have to type or paste them each time. Private: kept in the vault once one exists. */
export const useContacts = create<ContactsState>()((set, get) => ({
  contacts: [],
  add: (name, address) => {
    const checked = validateContact(name, address, get().contacts)
    if (!checked.ok) return checked
    const contact = { id: newId(), name: checked.name, address: checked.address }
    set((state) => ({ contacts: [...state.contacts, contact] }))
    return { ok: true, contact }
  },
  rename: (id, name) => {
    const current = get().contacts.find((c) => c.id === id)
    if (current === undefined) return false
    const checked = validateContact(name, current.address, get().contacts, id)
    if (!checked.ok) return false
    set((state) => ({
      contacts: state.contacts.map((c) => (c.id === id ? { ...c, name: checked.name } : c)),
    }))
    return true
  },
  remove: (id) => {
    set((state) => ({ contacts: state.contacts.filter((c) => c.id !== id) }))
  },
  setAll: (contacts) => {
    set({ contacts })
  },
}))

/** The saved contact for an address, if there is one. */
export function findContact(contacts: readonly Contact[], address: string): Contact | undefined {
  return contacts.find((c) => c.address === address.trim())
}

// --- Contact links ---------------------------------------------------------------------------

/** A link that adds someone to your contacts. The data is in the URL fragment, which servers never see. */
export const ADD_PATH = '/add'
const MAX_FRAGMENT_CHARS = 1000
const VERSION = 1

export interface SharedContact {
  address: string
  /** A suggested name; the person adding it can change it. */
  name?: string
}

export function encodeContact(contact: SharedContact): string {
  return textToBase64Url(
    JSON.stringify({
      v: VERSION,
      a: contact.address,
      ...(contact.name === undefined || contact.name === '' ? {} : { n: contact.name }),
    }),
  )
}

/** Reads a contact from untrusted input. Returns null for anything invalid. Never throws. */
export function decodeContact(encoded: string): SharedContact | null {
  if (encoded === '' || encoded.length > MAX_FRAGMENT_CHARS) return null
  const text = base64UrlToText(encoded)
  if (text === null) return null
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return null
    const { v, a, n } = data as Record<string, unknown>
    if (v !== VERSION || typeof a !== 'string' || !looksLikeAddress(a)) return null
    if (n === undefined) return { address: a }
    if (
      typeof n !== 'string' ||
      countGraphemes(n) > CONTACT_NAME_MAX ||
      !isPlainText(n) ||
      n.includes('\n')
    )
      return null
    return { address: a, name: n }
  } catch {
    return null
  }
}

export function contactUrl(origin: string, contact: SharedContact): string {
  return `${origin}${ADD_PATH}#${encodeContact(contact)}`
}

export function readContactFromHash(hash: string): SharedContact | null {
  return hash.startsWith('#') ? decodeContact(hash.slice(1)) : null
}

/**
 * Finds an address in text that came from a QR code, a paste or a link: a plain address, a
 * `zcash:` payment request, or a Zealed contact link. Returns null for anything else.
 */
export function parseAddressInput(text: string): SharedContact | null {
  const value = text.trim()
  if (value === '') return null
  if (looksLikeAddress(value)) return { address: value }
  if (/^zcash:/i.test(value)) {
    const address = value.slice('zcash:'.length).split('?')[0] ?? ''
    return looksLikeAddress(address) ? { address } : null
  }
  const hash = value.indexOf('#')
  if (hash >= 0) return decodeContact(value.slice(hash + 1))
  return null
}
