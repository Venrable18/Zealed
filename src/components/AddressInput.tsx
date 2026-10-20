import { useState } from 'react'
import {
  findContact,
  parseAddressInput,
  useContacts,
  type SharedContact,
} from '../features/contacts/contacts.ts'
import { Button } from './Button.tsx'
import { TextInput } from './Field.tsx'
import { QrScanner } from './QrScanner.tsx'

interface AddressInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string
  /** Called when what was typed, pasted or scanned was a contact link or payment request, with what it held. */
  onParsed?: (contact: SharedContact) => void
}

/**
 * An address field with ways to avoid typing a long address: pick a saved contact, scan a QR code,
 * or paste. Whatever comes in is read for an address (a plain address, a payment request or a
 * contact link), so the field only ever receives an address. The address is checked for its shape
 * only; the wallet checks it properly when sending.
 */
export function AddressInput({ label, value, onChange, hint, error, onParsed }: AddressInputProps) {
  const contacts = useContacts((state) => state.contacts)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const saved = findContact(contacts, value)
  // Some browsers have no clipboard reading (or only over HTTPS), so the button appears only where it can work.
  const clipboard = (navigator as { clipboard?: Clipboard }).clipboard
  const canPaste = typeof clipboard?.readText === 'function'

  function accept(text: string, source: string) {
    const parsed = parseAddressInput(text)
    if (parsed === null) {
      setMessage(`That ${source} does not contain a Zcash address.`)
      return
    }
    onChange(parsed.address)
    onParsed?.(parsed)
    setMessage(undefined)
  }

  async function paste() {
    try {
      accept((await clipboard?.readText()) ?? '', 'clipboard')
    } catch {
      setMessage('Could not read the clipboard. Paste into the field instead.')
    }
  }

  return (
    <div className="space-y-2">
      <TextInput
        label={label}
        value={value}
        onChange={(event) => {
          const text = event.target.value
          // A link or payment request pasted straight into the field becomes the address it holds.
          const parsed = /[#:]/.test(text) ? parseAddressInput(text) : null
          onChange(parsed?.address ?? text)
          if (parsed !== null) onParsed?.(parsed)
          setMessage(undefined)
        }}
        autoComplete="off"
        spellCheck={false}
        {...(hint === undefined ? {} : { hint })}
        {...(error === undefined ? {} : { error })}
      />
      {saved !== undefined && <p className="text-sm text-good">Saved contact: {saved.name}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {contacts.length > 0 && (
          <select
            aria-label="Choose a saved contact"
            value=""
            onChange={(event) => {
              const contact = contacts.find((c) => c.id === event.target.value)
              if (contact !== undefined) {
                onChange(contact.address)
                setMessage(undefined)
              }
            }}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
          >
            <option value="">Choose a saved contact…</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setScanning(!scanning)
            setMessage(undefined)
          }}
        >
          {scanning ? 'Close scanner' : 'Scan a QR code'}
        </Button>
        {canPaste && (
          <Button
            variant="secondary"
            onClick={() => {
              void paste()
            }}
          >
            Paste
          </Button>
        )}
      </div>
      {scanning && (
        <QrScanner
          onScan={(text) => {
            setScanning(false)
            accept(text, 'QR code')
          }}
          onCancel={() => {
            setScanning(false)
          }}
        />
      )}
      {message !== undefined && (
        <p role="alert" className="text-sm font-medium text-bad">
          {message}
        </p>
      )}
    </div>
  )
}
