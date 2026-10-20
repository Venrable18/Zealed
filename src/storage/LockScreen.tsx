import { useState } from 'react'
import { Button } from '../components/Button.tsx'
import { TextInput } from '../components/Field.tsx'
import { currentTime, useNow } from '../features/legacy/silent/useNow.ts'
import { WipeData } from '../features/settings/WipeData.tsx'
import { unlockVault } from './vaultState.ts'

/** Shown instead of the app while a vault exists and has not been unlocked. */
export function LockScreen() {
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
      setError('Too many wrong attempts.')
    } else if (result.reason === 'wrong-passphrase') setError('That passphrase is not right.')
    else setError('Your saved data could not be opened. Nothing was shown.')
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-16">
      <h1 className="text-3xl">Locked</h1>
      <p className="text-muted">
        Enter your passphrase to open your data. It is saved on this device, encrypted, and nowhere
        else.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (waitSeconds === 0) void submit()
        }}
        className="space-y-4"
      >
        <TextInput
          label="Passphrase"
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
                error:
                  waitSeconds > 0 ? `${error} Try again in ${String(waitSeconds)} seconds.` : error,
              })}
        />
        <Button type="submit" busy={busy} disabled={waitSeconds > 0 || passphrase === ''}>
          Unlock
        </Button>
      </form>
      <details className="rounded-card border border-line p-4">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">
          Forgot your passphrase?
        </summary>
        <div className="space-y-3">
          <p className="text-sm text-muted">
            There is no way to recover it, and no one can reset it for you: that is what keeps your
            data private. The only way forward is to wipe this device and start again. Wallet funds
            can then only be recovered with your seed phrase.
          </p>
          <WipeData />
        </div>
      </details>
    </div>
  )
}
