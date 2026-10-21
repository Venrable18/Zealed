import { useState } from 'react'
import { Button } from '../../../components/Button.tsx'
import { TextInput } from '../../../components/Field.tsx'
import { useToasts } from '../../../components/toastStore.ts'
import { useT } from '../../../i18n/index.ts'
import { CONTACT_NAME_MAX } from '../../contacts/contacts.ts'
import { inviteUrl } from './invite.ts'

/** Lets an owner who does not have a guardian's address yet send an invitation to get it. */
export function InviteGuardian() {
  const t = useT()
  const push = useToasts((state) => state.push)
  const [name, setName] = useState('')
  const link = inviteUrl(window.location.origin, { owner: name })

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      push('success', t('inviteMaker.copied'))
    } catch {
      push('error', t('receive.copyFailed'))
    }
  }

  return (
    <details className="rounded-card border border-line p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        {t('inviteMaker.title')}
      </summary>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('inviteMaker.intro')}</p>
        <TextInput
          label={t('inviteMaker.yourName')}
          value={name}
          maxLength={CONTACT_NAME_MAX * 4}
          onChange={(event) => {
            setName(event.target.value)
          }}
          autoComplete="off"
          hint={t('inviteMaker.yourNameHint')}
        />
        <label htmlFor="invite-link" className="block text-sm font-medium">
          {t('inviteMaker.linkLabel')}
        </label>
        <input
          id="invite-link"
          readOnly
          value={link}
          onFocus={(event) => {
            event.target.select()
          }}
          className="block min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm"
        />
        <Button
          variant="secondary"
          onClick={() => {
            void copy()
          }}
        >
          {t('inviteMaker.copy')}
        </Button>
        <p className="text-sm text-muted">{t('inviteMaker.note')}</p>
      </div>
    </details>
  )
}
