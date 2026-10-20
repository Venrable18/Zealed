import { useState } from 'react'
import { Link } from 'react-router'
import { AddressInput } from '../../components/AddressInput.tsx'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { TextInput } from '../../components/Field.tsx'
import { useToasts } from '../../components/toastStore.ts'
import {
  CONTACT_NAME_MAX,
  useContacts,
  type Contact,
  type ContactField,
} from '../../features/contacts/contacts.ts'
import { NotSavedNotice } from '../../storage/NotSavedNotice.tsx'

function ContactRow({ contact }: { contact: Contact }) {
  const rename = useContacts((state) => state.rename)
  const remove = useContacts((state) => state.remove)
  const push = useToasts((state) => state.push)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(contact.name)
  const [removing, setRemoving] = useState(false)

  return (
    <li className="space-y-2 rounded-card border border-line bg-surface p-4">
      {editing ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (rename(contact.id, name)) setEditing(false)
            else push('error', 'That name cannot be used.')
          }}
        >
          <TextInput
            label={`New name for ${contact.name}`}
            value={name}
            maxLength={CONTACT_NAME_MAX * 4}
            onChange={(e) => {
              setName(e.target.value)
            }}
          />
          <div className="flex gap-3">
            <Button type="submit">Save name</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setName(contact.name)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="font-medium">{contact.name}</p>
          <p className="break-all text-xs text-muted">{contact.address}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              aria-label={`Rename ${contact.name}`}
              onClick={() => {
                setEditing(true)
              }}
            >
              Rename
            </Button>
            <Button
              variant="ghost"
              aria-label={`Remove ${contact.name}`}
              onClick={() => {
                setRemoving(true)
              }}
            >
              Remove
            </Button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={removing}
        title={`Remove ${contact.name}?`}
        confirmLabel="Remove"
        danger
        onCancel={() => {
          setRemoving(false)
        }}
        onConfirm={() => {
          setRemoving(false)
          remove(contact.id)
        }}
      >
        They are removed from this list only. Letters and payments already sent are not affected.
      </ConfirmDialog>
    </li>
  )
}

export function Contacts() {
  const contacts = useContacts((state) => state.contacts)
  const add = useContacts((state) => state.add)
  const push = useToasts((state) => state.push)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({})

  return (
    <div className="space-y-10 py-10">
      <div>
        <h1 className="text-3xl">Contacts</h1>
        <p className="mt-3 max-w-prose text-muted">
          Names for the addresses you use, so you can pick a person instead of pasting a long
          address. They stay on this device.
        </p>
      </div>
      <NotSavedNotice />

      <section className="space-y-4">
        <h2 className="text-xl">Add a contact</h2>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const result = add(name, address)
            if (result.ok) {
              setName('')
              setAddress('')
              setErrors({})
              push('success', `${result.contact.name} was saved.`)
            } else setErrors(result.errors)
          }}
        >
          <TextInput
            label="Name"
            value={name}
            maxLength={CONTACT_NAME_MAX * 4}
            onChange={(e) => {
              setName(e.target.value)
            }}
            autoComplete="off"
            {...(errors.name === undefined ? {} : { error: errors.name })}
          />
          <AddressInput
            label="Address"
            value={address}
            onChange={setAddress}
            onParsed={(contact) => {
              if (name.trim() === '' && contact.name !== undefined) setName(contact.name)
            }}
            hint="Type it, paste it, or scan a QR code or contact link."
            {...(errors.address === undefined ? {} : { error: errors.address })}
          />
          <Button type="submit">Save contact</Button>
        </form>
        <p className="text-sm text-muted">
          Someone can also send you a contact link from their{' '}
          <Link to="/receive" className="underline underline-offset-4">
            Receive
          </Link>{' '}
          page. Opening it adds them here after you confirm.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl">Your contacts</h2>
        {contacts.length === 0 ? (
          <EmptyState title="No contacts yet">
            Add someone above, or open a contact link they send you.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {contacts.map((contact) => (
              <ContactRow key={contact.id} contact={contact} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
