import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { TextInput } from '../../components/Field.tsx'
import { useToasts } from '../../components/toastStore.ts'
import {
  CONTACT_NAME_MAX,
  findContact,
  readContactFromHash,
  useContacts,
} from '../../features/contacts/contacts.ts'

/** The page a contact link opens. The contact is read from the URL fragment, which servers never see. */
export function AddContact() {
  const { hash } = useLocation()
  const shared = readContactFromHash(hash)
  const contacts = useContacts((state) => state.contacts)
  const add = useContacts((state) => state.add)
  const push = useToasts((state) => state.push)
  const navigate = useNavigate()
  const [name, setName] = useState(shared?.name ?? '')
  const [error, setError] = useState<string | undefined>()

  if (shared === null) {
    return (
      <div className="py-10">
        <EmptyState
          title="This link does not look right"
          action={
            <Link to="/contacts" className="underline underline-offset-4">
              Go to contacts
            </Link>
          }
        >
          Ask for the contact link again, and make sure the whole link was copied.
        </EmptyState>
      </div>
    )
  }

  const existing = findContact(contacts, shared.address)

  return (
    <div className="space-y-6 py-10">
      <h1 className="text-3xl">Add a contact</h1>
      {existing !== undefined ? (
        <p role="status" className="rounded-control border border-line px-4 py-3">
          This address is already saved as <strong>{existing.name}</strong>.{' '}
          <Link to="/contacts" className="underline underline-offset-4">
            Go to contacts
          </Link>
        </p>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const result = add(name, shared.address)
            if (result.ok) {
              push('success', `${result.contact.name} was saved.`)
              void navigate('/contacts')
            } else
              setError(result.errors.name ?? result.errors.address ?? 'That could not be saved.')
          }}
        >
          <p className="text-muted">
            Someone sent you a link to add them. Check it came from who you expect: anyone can make
            one.
          </p>
          <TextInput
            label="Name"
            value={name}
            maxLength={CONTACT_NAME_MAX * 4}
            onChange={(e) => {
              setName(e.target.value)
            }}
            autoComplete="off"
            hint="Their suggested name is filled in. Change it if you like."
            {...(error === undefined ? {} : { error })}
          />
          <div>
            <p className="text-sm font-medium">Address</p>
            <p className="break-all text-sm text-muted">{shared.address}</p>
          </div>
          <Button type="submit">Save contact</Button>
        </form>
      )}
    </div>
  )
}
