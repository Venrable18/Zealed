import { useEffect, useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { CountdownTimer } from '../../components/CountdownTimer.tsx'
import { TextInput } from '../../components/Field.tsx'
import type { SeedPort } from './seedPort.ts'

/** How long the words stay on screen. */
export const REVEAL_MS = 60_000
/** Wrong passphrases allowed before a pause. */
export const MAX_ATTEMPTS = 5
export const COOLDOWN_MS = 30_000

function currentTime(): number {
  return Date.now()
}

/**
 * Shows the seed phrase after the passphrase is entered again. The words are never put on the
 * clipboard or written anywhere, disappear after a minute, and are cleared when hidden or when
 * this screen closes.
 */
export function SeedExport({ port }: { port: SeedPort | null }) {
  const [asking, setAsking] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [words, setWords] = useState<string[] | undefined>()
  const [hideAt, setHideAt] = useState(0)
  const [failures, setFailures] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)

  // Clear the words when this screen goes away.
  useEffect(
    () => () => {
      setWords(undefined)
    },
    [],
  )

  function close() {
    setAsking(false)
    setPassphrase('')
    setError(undefined)
  }

  async function reveal() {
    if (port === null) return
    if (currentTime() < lockedUntil) {
      setError('Too many wrong attempts. Wait a moment and try again.')
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      if (!(await port.verifyPassphrase(passphrase))) {
        const next = failures + 1
        setFailures(next)
        if (next >= MAX_ATTEMPTS) {
          setLockedUntil(currentTime() + COOLDOWN_MS)
          setFailures(0)
          setError('Too many wrong attempts. Wait 30 seconds and try again.')
        } else setError('That passphrase is not right.')
        setBusy(false)
        return
      }
      const seed = await port.exportSeed()
      setFailures(0)
      setWords(seed)
      setHideAt(currentTime() + REVEAL_MS)
      close()
    } catch {
      setError('The seed phrase could not be read. Nothing was shown.')
    }
    setBusy(false)
  }

  return (
    <section aria-labelledby="seed-title" className="space-y-3">
      <h2 id="seed-title" className="text-lg font-semibold">
        Seed phrase
      </h2>
      <p className="text-sm text-muted">
        These words are the only way to restore your wallet if this device is lost or its data is
        cleared.
      </p>

      {port === null && (
        <p className="text-sm text-muted">
          The wallet does not exist yet, so there is no seed phrase to show.
        </p>
      )}

      {words === undefined ? (
        <Button
          variant="secondary"
          disabled={port === null}
          onClick={() => {
            setAsking(true)
          }}
        >
          Show seed phrase
        </Button>
      ) : (
        <div className="space-y-3 rounded-card border border-warn bg-warn-soft p-4">
          <p className="font-medium">
            Anyone with these words can take all your funds. Write them down. Do not photograph or
            copy them.
          </p>
          <ol className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {words.map((word, index) => (
              <li key={index} className="tabular-nums">
                <span className="mr-2 text-muted">{index + 1}.</span>
                {word}
              </li>
            ))}
          </ol>
          <div className="text-sm">
            Hiding in{' '}
            <CountdownTimer
              targetMs={hideAt}
              doneLabel="Hidden"
              onDone={() => {
                setWords(undefined)
              }}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setWords(undefined)
            }}
          >
            Hide now
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={asking}
        title="Enter your passphrase"
        confirmLabel={busy ? 'Checking…' : 'Show'}
        onCancel={close}
        onConfirm={() => {
          void reveal()
        }}
      >
        <TextInput
          label="Passphrase"
          type="password"
          autoComplete="off"
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.target.value)
          }}
          {...(error === undefined ? {} : { error })}
        />
      </ConfirmDialog>
    </section>
  )
}
