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
import { useT } from '../../i18n/index.ts'
import { NotSavedNotice } from '../../storage/NotSavedNotice.tsx'

function ContactRow({ contact }: { contact: Contact }) {
  const t = useT()
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
            else push('error', t('contacts.badName'))
          }}
        >
          <TextInput
            label={t('contacts.newName', { name: contact.name })}
            value={name}
            maxLength={CONTACT_NAME_MAX * 4}
            onChange={(e) => {
              setName(e.target.value)
            }}
          />
          <div className="flex gap-3">
            <Button type="submit">{t('contacts.saveName')}</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setName(contact.name)
              }}
            >
              {t('contacts.cancel')}
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
              aria-label={t('contacts.renameLabel', { name: contact.name })}
              onClick={() => {
                setEditing(true)
              }}
            >
              {t('contacts.rename')}
            </Button>
            <Button
              variant="ghost"
              aria-label={t('contacts.removeLabel', { name: contact.name })}
              onClick={() => {
                setRemoving(true)
              }}
            >
              {t('contacts.remove')}
            </Button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={removing}
        title={t('contacts.removeTitle', { name: contact.name })}
        confirmLabel={t('contacts.remove')}
        danger
        onCancel={() => {
          setRemoving(false)
        }}
        onConfirm={() => {
          setRemoving(false)
          remove(contact.id)
        }}
      >
        {t('contacts.removeBody')}
      </ConfirmDialog>
    </li>
  )
}

export function Contacts() {
  const t = useT()
  const contacts = useContacts((state) => state.contacts)
  const add = useContacts((state) => state.add)
  const push = useToasts((state) => state.push)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({})

  return (
    <div className="max-w-3xl space-y-10 py-10">
      <div>
        <h1 className="text-4xl">{t('contacts.title')}</h1>
        <p className="mt-3 max-w-prose text-muted">{t('contacts.intro')}</p>
      </div>
      <NotSavedNotice />

      <section className="space-y-4">
        <h2 className="text-xl">{t('contacts.addTitle')}</h2>
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
              push('success', t('contacts.saved', { name: result.contact.name }))
            } else setErrors(result.errors)
          }}
        >
          <TextInput
            label={t('contacts.name')}
            value={name}
            maxLength={CONTACT_NAME_MAX * 4}
            onChange={(e) => {
              setName(e.target.value)
            }}
            autoComplete="off"
            {...(errors.name === undefined ? {} : { error: errors.name })}
          />
          <AddressInput
            label={t('contacts.address')}
            value={address}
            onChange={setAddress}
            onParsed={(contact) => {
              if (name.trim() === '' && contact.name !== undefined) setName(contact.name)
            }}
            hint={t('contacts.addressHint')}
            {...(errors.address === undefined ? {} : { error: errors.address })}
          />
          <Button type="submit">{t('contacts.save')}</Button>
        </form>
        <p className="text-sm text-muted">
          {t('contacts.linkNote')}{' '}
          <Link to="/receive" className="underline underline-offset-4">
            {t('nav.receive')}
          </Link>
          {t('contacts.linkNote2')}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl">{t('contacts.listTitle')}</h2>
        {contacts.length === 0 ? (
          <EmptyState title={t('contacts.emptyTitle')}>{t('contacts.empty')}</EmptyState>
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
