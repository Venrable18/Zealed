import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { TextInput } from '../../components/Field.tsx'
import { QrDisplay } from '../../components/QrDisplay.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { CONTACT_NAME_MAX, contactUrl } from '../../features/contacts/contacts.ts'
import { readInviteFromHash } from '../../features/legacy/silent/invite.ts'
import { useReceiveWallet } from '../../features/receive/walletPort.ts'
import { useT } from '../../i18n/index.ts'

/**
 * The page a guardian invitation opens. It explains the role in plain words and, once the guardian
 * has an address, makes an ordinary contact link to send back. Nothing is sent from here: the
 * guardian chooses how to pass the link on.
 */
export function GuardianInvite() {
  const t = useT()
  const { hash } = useLocation()
  const invite = readInviteFromHash(hash)
  const wallet = useReceiveWallet()
  const push = useToasts((state) => state.push)
  const [address, setAddress] = useState<string | undefined>()
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    if (wallet === null) return
    let cancelled = false
    wallet.ownAddress().then(
      (value) => {
        if (!cancelled) setAddress(value)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [wallet])

  async function fresh() {
    if (wallet === null) return
    try {
      setAddress(await wallet.newAddress())
    } catch {
      push('error', t('receive.newFailed'))
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      push('success', t('invite.replyCopied'))
    } catch {
      push('error', t('receive.copyFailed'))
    }
  }

  if (invite === null) {
    return (
      <div className="py-10">
        <EmptyState title={t('invite.badTitle')}>{t('invite.badBody')}</EmptyState>
      </div>
    )
  }

  const cleanName = name.trim()
  const reply =
    address === undefined
      ? undefined
      : contactUrl(window.location.origin, {
          address,
          ...(cleanName === '' ? {} : { name: cleanName }),
        })

  return (
    <div className="space-y-8 py-10">
      <div>
        <h1 className="text-3xl">{t('invite.title')}</h1>
        {/* The name came from the link, so it is shown as plain text only. */}
        <p className="mt-3 text-lg">
          {invite.owner === undefined
            ? t('invite.fromAnon')
            : t('invite.from', { owner: invite.owner })}
        </p>
        <p
          role="note"
          className="mt-3 rounded-control border border-warn bg-warn-soft px-4 py-3 text-sm"
        >
          {t('invite.check')}
        </p>
      </div>

      <section aria-labelledby="what-title" className="space-y-3">
        <h2 id="what-title" className="text-xl">
          {t('invite.whatTitle')}
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-muted">
          <li>{t('invite.what1')}</li>
          <li>{t('invite.what2')}</li>
          <li>{t('invite.what3')}</li>
          <li>{t('invite.what4')}</li>
        </ul>
      </section>

      <section aria-labelledby="reply-title" className="space-y-4">
        <h2 id="reply-title" className="text-xl">
          {t('invite.replyTitle')}
        </h2>
        <p className="max-w-prose text-muted">{t('invite.replyIntro')}</p>
        {wallet === null && (
          <EmptyState title={t('receive.noWalletTitle')}>{t('invite.noWallet')}</EmptyState>
        )}
        {failed && (
          <p role="alert" className="rounded-control border border-bad bg-bad-soft px-4 py-3">
            {t('invite.failed')}
          </p>
        )}
        {reply !== undefined && (
          <>
            <TextInput
              label={t('invite.yourName')}
              value={name}
              maxLength={CONTACT_NAME_MAX * 4}
              onChange={(event) => {
                setName(event.target.value)
              }}
              autoComplete="off"
              hint={t('invite.yourNameHint')}
            />
            <label htmlFor="reply-link" className="block text-sm font-medium">
              {t('invite.replyLabel')}
            </label>
            <input
              id="reply-link"
              readOnly
              value={reply}
              onFocus={(event) => {
                event.target.select()
              }}
              className="block min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  void copy(reply)
                }}
              >
                {t('invite.copyReply')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void fresh()
                }}
              >
                {t('invite.newAddress')}
              </Button>
            </div>
            <QrDisplay value={reply} label={t('invite.qr')} />
          </>
        )}
      </section>
    </div>
  )
}
