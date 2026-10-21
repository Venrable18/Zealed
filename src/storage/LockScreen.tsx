import { useState } from 'react'
import { Button } from '../components/Button.tsx'
import { TextInput } from '../components/Field.tsx'
import { useT } from '../i18n/index.ts'
import { currentTime, useNow } from '../features/legacy/silent/useNow.ts'
import { WipeData } from '../features/settings/WipeData.tsx'
import { unlockVault } from './vaultState.ts'

/** Shown instead of the app while a vault exists and has not been unlocked. */
export function LockScreen() {
  const t = useT()
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const now = useNow()
  const waitSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000))

  async function submit() {
    setBusy(true)
    setError(undefined)
    const result = await unlockVault(passphrase)
    setBusy(false)
    if (result.ok) {
      setPassphrase('')
      return
    }
    setPassphrase('')
    if (result.reason === 'cooling-down') {
      setRetryAt(currentTime() + result.retryInMs)
      setError(t('lock.tooMany'))
    } else if (result.reason === 'wrong-passphrase') setError(t('lock.wrong'))
    else setError(t('lock.cannotOpen'))
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-16">
      <h1 className="text-3xl">{t('lock.title')}</h1>
      <p className="text-muted">{t('lock.intro')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (waitSeconds === 0) void submit()
        }}
        className="space-y-4"
      >
        <TextInput
          label={t('lock.passphrase')}
          type="password"
          autoComplete="current-password"
          autoFocus
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.target.value)
          }}
          {...(error === undefined
            ? {}
            : {
                error: waitSeconds > 0 ? t('lock.wait', { error, seconds: waitSeconds }) : error,
              })}
        />
        <Button type="submit" busy={busy} disabled={waitSeconds > 0 || passphrase === ''}>
          {t('lock.unlock')}
        </Button>
      </form>
      <details className="rounded-card border border-line p-4">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">{t('lock.forgot')}</summary>
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('lock.forgotBody')}</p>
          <WipeData />
        </div>
      </details>
    </div>
  )
}
