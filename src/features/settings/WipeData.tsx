import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { TextInput } from '../../components/Field.tsx'
import { resetAllStores, wipeLocalData, type WipeDeps, type WipeResult } from './wipe.ts'

export const CONFIRM_WORD = 'WIPE'

interface WipeDataProps {
  /** Replaced in tests. */
  deps?: WipeDeps
  /** Called when the wipe finished. By default the page returns to the start. */
  onDone?: (result: WipeResult) => void
}

function browserDeps(): WipeDeps {
  return { localStorage, sessionStorage, indexedDB, resetStores: resetAllStores }
}

/** Deletes everything Zealed keeps on this device. A typed word is needed, because it cannot be undone. */
export function WipeData({ deps, onDone }: WipeDataProps) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WipeResult | undefined>()
  const ready = typed === CONFIRM_WORD

  async function run() {
    setBusy(true)
    const done = await wipeLocalData(deps ?? browserDeps())
    setBusy(false)
    setOpen(false)
    setTyped('')
    setResult(done)
    if (onDone !== undefined) onDone(done)
    else window.location.assign('/')
  }

  return (
    <section aria-labelledby="wipe-title" className="space-y-3">
      <h2 id="wipe-title" className="text-lg font-semibold">
        Local data
      </h2>
      <p className="text-sm text-muted">
        Everything Zealed keeps lives in this browser: settings, pots, letters, messages and, later,
        your wallet. Wiping removes all of it from this device. Without your seed phrase, wallet
        funds cannot be recovered.
      </p>
      <Button
        variant="danger"
        onClick={() => {
          setOpen(true)
        }}
      >
        Wipe all local data
      </Button>
      {result !== undefined && (
        <p role="status" className="text-sm">
          Wiped.
          {result.databasesUnknown
            ? ' This browser cannot list its databases, so clear site data in the browser settings to be sure.'
            : ''}
        </p>
      )}
      <ConfirmDialog
        open={open}
        title="Wipe all local data?"
        confirmLabel={busy ? 'Wiping…' : 'Wipe everything'}
        danger
        onCancel={() => {
          setOpen(false)
          setTyped('')
        }}
        onConfirm={() => {
          if (ready && !busy) void run()
        }}
      >
        <p>This cannot be undone. Type {CONFIRM_WORD} to continue.</p>
        <div className="mt-3">
          <TextInput
            label={`Type ${CONFIRM_WORD}`}
            value={typed}
            autoComplete="off"
            onChange={(event) => {
              setTyped(event.target.value)
            }}
          />
        </div>
        {!ready && typed !== '' && (
          <p className="mt-2 text-sm text-muted">The word must match exactly.</p>
        )}
      </ConfirmDialog>
    </section>
  )
}
