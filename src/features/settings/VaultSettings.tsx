import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { TextInput } from '../../components/Field.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { MIN_PASSPHRASE_LENGTH, passphraseProblem } from '../../storage/vault.ts'
import {
  changeVaultPassphrase,
  createVault,
  lockVault,
  useVaultStatus,
} from '../../storage/vaultState.ts'

/** Keep data on this device, encrypted with a passphrase. Without it, nothing is saved. */
export function VaultSettings() {
  const status = useVaultStatus((state) => state.status)
  const push = useToasts((state) => state.push)
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newConfirm, setNewConfirm] = useState('')
  const [changeError, setChangeError] = useState<string | undefined>()

  async function create() {
    const problem = passphraseProblem(passphrase)
    if (problem !== null) {
      setError(problem)
      return
    }
    if (passphrase !== confirm) {
      setError('The two passphrases do not match.')
      return
    }
    setBusy(true)
    setError(undefined)
    const result = await createVault(passphrase)
    setBusy(false)
    if (result.ok) {
      setPassphrase('')
      setConfirm('')
      push('success', 'Your data is now saved on this device, encrypted.')
    } else if (result.reason === 'weak-passphrase') setError('That passphrase is too weak.')
    else setError('This browser could not set up secure storage here. Nothing is saved.')
  }

  async function change() {
    const problem = passphraseProblem(newPass)
    if (problem !== null) {
      setChangeError(problem)
      return
    }
    if (newPass !== newConfirm) {
      setChangeError('The two new passphrases do not match.')
      return
    }
    const result = await changeVaultPassphrase(oldPass, newPass)
    if (result.ok) {
      setChanging(false)
      setOldPass('')
      setNewPass('')
      setNewConfirm('')
      setChangeError(undefined)
      push('success', 'Passphrase changed.')
    } else if (result.reason === 'wrong-passphrase')
      setChangeError('The current passphrase is not right.')
    else if (result.reason === 'weak-passphrase') setChangeError('The new passphrase is too weak.')
    else setChangeError('The passphrase could not be changed. Nothing was changed.')
  }

  return (
    <section id="vault" aria-labelledby="vault-title" className="space-y-3">
      <h2 id="vault-title" className="text-lg font-semibold">
        Keep my data on this device
      </h2>

      {status === 'unavailable' && (
        <p className="text-sm text-muted">
          This browser cannot store data securely here (some private windows block it), so nothing
          can be saved.
        </p>
      )}

      {(status === 'none' || status === 'checking') && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
          className="space-y-4"
        >
          <p className="text-sm text-muted">
            Right now <strong className="text-ink">nothing is saved</strong>: pots, letters,
            messages and contacts disappear when you reload. Choose a passphrase to keep them here,
            encrypted. There is no recovery if you forget it.
          </p>
          <TextInput
            label="New passphrase"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value)
            }}
            hint={`At least ${String(MIN_PASSPHRASE_LENGTH)} characters. A few random words work well.`}
          />
          <TextInput
            label="Repeat the passphrase"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
            }}
            {...(error === undefined ? {} : { error })}
          />
          <Button type="submit" busy={busy}>
            Save my data, encrypted
          </Button>
        </form>
      )}

      {status === 'unlocked' && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Your data is saved on this device, encrypted with your passphrase. It locks itself after
            a period of inactivity (set above).
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void lockVault()}>
              Lock now
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setChanging(true)
              }}
            >
              Change passphrase
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={changing}
        title="Change your passphrase"
        confirmLabel="Change"
        onCancel={() => {
          setChanging(false)
          setChangeError(undefined)
        }}
        onConfirm={() => {
          void change()
        }}
      >
        <div className="space-y-3">
          <TextInput
            label="Current passphrase"
            type="password"
            autoComplete="current-password"
            value={oldPass}
            onChange={(e) => {
              setOldPass(e.target.value)
            }}
          />
          <TextInput
            label="New passphrase"
            type="password"
            autoComplete="new-password"
            value={newPass}
            onChange={(e) => {
              setNewPass(e.target.value)
            }}
          />
          <TextInput
            label="Repeat the new passphrase"
            type="password"
            autoComplete="new-password"
            value={newConfirm}
            onChange={(e) => {
              setNewConfirm(e.target.value)
            }}
            {...(changeError === undefined ? {} : { error: changeError })}
          />
        </div>
      </ConfirmDialog>
    </section>
  )
}
