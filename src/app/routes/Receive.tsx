import { useEffect, useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { TextInput } from '../../components/Field.tsx'
import { QrDisplay } from '../../components/QrDisplay.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { CONTACT_NAME_MAX, contactUrl } from '../../features/contacts/contacts.ts'
import { useT } from '../../i18n/index.ts'
import { useReceiveWallet } from '../../features/receive/walletPort.ts'

export function Receive() {
  const t = useT()
  const wallet = useReceiveWallet()
  const push = useToasts((state) => state.push)
  const [address, setAddress] = useState<string | undefined>()
  const [failed, setFailed] = useState(false)
  const [fresh, setFresh] = useState(false)
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

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text)
      push('success', done)
    } catch {
      push('error', t('receive.copyFailed'))
    }
  }

  async function makeNew() {
    if (wallet === null) return
    try {
      setAddress(await wallet.newAddress())
      setFresh(true)
    } catch {
      push('error', t('receive.newFailed'))
    }
  }

  const cleanName = name.trim()
  const link =
    address === undefined
      ? undefined
      : contactUrl(window.location.origin, {
          address,
          ...(cleanName === '' ? {} : { name: cleanName }),
        })

  return (
    <div className="space-y-10 py-10">
      <div>
        <h1 className="text-3xl">{t('receive.title')}</h1>
        <p className="mt-3 max-w-prose text-muted">{t('receive.intro')}</p>
      </div>

      {wallet === null && (
        <EmptyState title={t('receive.noWalletTitle')}>{t('receive.noWallet')}</EmptyState>
      )}
      {failed && (
        <p role="alert" className="rounded-control border border-bad bg-bad-soft px-4 py-3">
          {t('receive.failed')}
        </p>
      )}

      {address !== undefined && (
        <>
          <section aria-labelledby="address-title" className="space-y-4">
            <h2 id="address-title" className="text-xl">
              {fresh ? t('receive.freshAddress') : t('receive.yourAddress')}
            </h2>
            <QrDisplay value={`zcash:${address}`} label={t('receive.qr')} />
            <p
              className="break-all rounded-control border border-line bg-surface p-3 font-mono text-sm"
              data-testid="own-address"
            >
              {address}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  void copy(address, t('receive.copied'))
                }}
              >
                {t('receive.copy')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void makeNew()
                }}
              >
                {t('receive.new')}
              </Button>
            </div>
            <p className="text-sm text-muted">{t('receive.newNote')}</p>
          </section>

          <section aria-labelledby="link-title" className="space-y-4">
            <h2 id="link-title" className="text-xl">
              {t('receive.linkTitle')}
            </h2>
            <p className="max-w-prose text-muted">{t('receive.linkIntro')}</p>
            <TextInput
              label={t('receive.yourName')}
              value={name}
              maxLength={CONTACT_NAME_MAX * 4}
              onChange={(e) => {
                setName(e.target.value)
              }}
              autoComplete="off"
              hint={t('receive.yourNameHint')}
            />
            {link !== undefined && (
              <>
                <label htmlFor="contact-link" className="block text-sm font-medium">
                  {t('receive.linkLabel')}
                </label>
                <input
                  id="contact-link"
                  readOnly
                  value={link}
                  onFocus={(e) => {
                    e.target.select()
                  }}
                  className="block min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    void copy(link, t('receive.linkCopied'))
                  }}
                >
                  {t('receive.copyLink')}
                </Button>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
