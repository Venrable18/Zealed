import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { TextInput } from '../../components/Field.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { useT } from '../../i18n/index.ts'
import {
  CONTACT_NAME_MAX,
  findContact,
  readContactFromHash,
  useContacts,
} from '../../features/contacts/contacts.ts'

/** The page a contact link opens. The contact is read from the URL fragment, which servers never see. */
export function AddContact() {
  const t = useT()
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
          title={t('add.badTitle')}
          action={
            <Link to="/contacts" className="underline underline-offset-4">
              {t('add.goContacts')}
            </Link>
          }
        >
          {t('add.badBody')}
        </EmptyState>
      </div>
    )
  }

  const existing = findContact(contacts, shared.address)

  return (
    <div className="space-y-6 py-10">
      <h1 className="text-3xl">{t('add.title')}</h1>
      {existing !== undefined ? (
        <p role="status" className="rounded-control border border-line px-4 py-3">
          {t('add.already', { name: existing.name })}{' '}
          <Link to="/contacts" className="underline underline-offset-4">
            {t('add.goContacts')}
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
              push('success', t('contacts.saved', { name: result.contact.name }))
              void navigate('/contacts')
            } else setError(result.errors.name ?? result.errors.address ?? t('add.cannotSave'))
          }}
        >
          <p className="text-muted">{t('add.intro')}</p>
          <TextInput
            label={t('contacts.name')}
            value={name}
            maxLength={CONTACT_NAME_MAX * 4}
            onChange={(e) => {
              setName(e.target.value)
            }}
            autoComplete="off"
            hint={t('add.nameHint')}
            {...(error === undefined ? {} : { error })}
          />
          <div>
            <p className="text-sm font-medium">{t('contacts.address')}</p>
            <p className="break-all text-sm text-muted">{shared.address}</p>
          </div>
          <Button type="submit">{t('contacts.save')}</Button>
        </form>
      )}
    </div>
  )
}
